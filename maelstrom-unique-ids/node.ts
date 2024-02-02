import { FileSink } from "bun";

/// Maelstrom Node specification
/// https://github.com/jepsen-io/maelstrom/blob/main/doc/protocol.md
export class Node {
  id: NodeId | null = null;        // This node's ID, which is unique in its cluster.
  nodeIds: NodeId[] | null = null; // All nodes in the cluster, including this one.
  nextMsgId: MessageId = 0;        // Message ID's are unique on the node that sent them.

  handlers: Map<MessageType, MsgHandler> = new Map();
  callbacks: Map<MessageId, MsgHandler> = new Map();

  private input: AsyncIterable<string> = console;
  private output: FileSink = Bun.stdout.writer();

  public constructor(input?: AsyncIterable<string>, output?: FileSink) {
    // For testing
    if (input) this.input = input;
    if (output) this.output = output;
  }


  public initialize(id: NodeId, nodeIds: NodeId[]): void {
    this.id = id;
    this.nodeIds = nodeIds;
  }


  public registerHandle(type: MessageType, fn: MsgHandler): void | Error {
    if (this.handlers.has(type)) {
      return new Error(`Tried to register a duplicate handler. Already had handler for ${type}.`);
    }

    this.handlers.set(type, fn);
  }


  /// Send a message response to its callback handler. Log an error if one occurs.
  public async handleCallback(handler: MsgHandler, msg: MaelstromMsg): Promise<void | Error> {
    const result = await handler(msg);

    // TODO - Could probably do a bit better for the error handling here.
    if (result instanceof Error) {
      console.error(`Callback error, error was ${result.message}`);
      return result as Error;
    }
  }

  /// Send a message to its handler. Send an RPC error if one occurs.
  public async handleMessage(handler: MsgHandler, msg: MaelstromMsg): Promise<void | Error> {
    const result = await handler(msg);

    if (result instanceof Error) {
      // TODO - Send RPC error here
      // return result as Error;
    }
  }


  /// Default handler for init messages.
  /// Parse the message body and initialize self according to its parameters.
  public async handleInitMsg(msg: MaelstromMsg): Promise<void | Error> {
    if (msg.body === null || msg.body === undefined) {
      return new Error(`I was assured that the body for init message would be present, but it wasn't. Body was ${msg.body}`);
    }

    if (!isInitMessageBody(msg.body)) {
      return new Error(`Well, we had a message body but unfortunately it was not actually an InitMsgBody. Sorry! Body was ${msg.body}`);
    }

    const body: InitMsgBody = msg.body;

    if (body.node_id === undefined || body.node_id === null) {
      return new Error(`Init message body did not provide a 'node_id', instead 'node_id' was ${body.node_id}`);
    }
    if (body.node_ids === undefined || body.node_ids === null) {
      return new Error(`Init message body did not provide 'node_ids', instead 'node_ids' was ${body.node_id}`);
    }

    // Initialize self
    this.initialize(body.node_id, body.node_ids);

    // If application has provided a handler override for init, use that.
    if (this.handlers.has("init")) {
      const result: void | Error = await this.handlers.get("init")!(msg);
      if (result instanceof Error) {
        return result as Error;
      }
    }

    // Finally, reply and indicate that we initialized successfully.
    const replyBody: MessageBody = {
      type: "init_ok"
    };

    await this.replyToMsg(msg, replyBody);
  }


  public async send(destination: NodeId, body: any): Promise<void | Error> {
    if (this.id === null) {
      return Error(`Tried to send a message, but we haven't been initialized yet. Our ID is 'null'.`);
    }

    const respBody: MaelstromMsg = {
      src: this.id,
      dest: destination,
      body: body
    };

    this.output.write(JSON.stringify(respBody));
    this.output.write("\n");
  }


  /// Reply to a request with the given response body
  public async replyToMsg(replyingTo: MaelstromMsg, withBody: MessageBody): Promise<void | Error> {
    if (replyingTo.body && "msg_id" in replyingTo.body) {
      const replyToMsgId: number = replyingTo.body.msg_id;

      const replyBody = {
        ...withBody,
        in_reply_to: replyToMsgId
      };

      if (replyingTo.src === null || replyingTo.src === undefined) {
        return new Error(`Tried to reply to message ${replyingTo} but it doesn't have a 'src' so we can't.`);
      }

      return this.send(replyingTo.src, replyBody);
    } 
    
    // Otherwise, no body or no msg_id in request so we can't reply to it.
    return new Error(`Tried to reply to message ${replyingTo} but its body has no 'msg_id' so we can't.`);
  }


  public async RPC(destination: NodeId, body: any, handler: MsgHandler): Promise<void | Error> {
    // Increment next message ID
    this.nextMsgId += 1;
    const msgId = this.nextMsgId;

    this.callbacks.set(msgId, handler);
    body = {
      ...body,
      msg_id: msgId
    }

    return this.send(destination, body);
  }


  public async run(): Promise<void | Error> {
    for await (const line of this.input) {
      const incoming: any = JSON.parse(line);
      if (!isMaelstromMessage(incoming)) {
        // TODO - Check the protocol docs to see if it is appropriate to respond
        //  with an error from our MaelstromError codes here.
        console.error(`Read a JSON message from stdin, but it did not conform to expected protocol structure.`);
        continue;
      }

      const incomingMessage = incoming as MaelstromMsg;
      const msgType: MessageType | null = getMessageType(incomingMessage);
      
      // If incoming body is in reply to another message, it is a callback.
      if ("in_reply_to" in incomingMessage.body && Number.isInteger(incomingMessage.body.in_reply_to)) {
        // Extract callback
        const callback: MsgHandler | undefined = this.callbacks.get(incomingMessage.body.in_reply_to);

        if (!callback) {
          // No callback exists, log the message and skip.
          console.error(`Ignoring reply to ${incomingMessage.body.in_reply_to}, since we don't have a callback for it.`);
          continue;
        } else {
          // We have a callback, so call its handler, remove the callback from our map, and move on.
          this.handleCallback(callback, incomingMessage);
          this.callbacks.delete(incomingMessage.body.in_reply_to);
          continue;
        }
      }

      // Incoming body is not a callback, so we expect its type to have a registered handler.
      if (msgType === null) {
        console.error(`Incoming message did not have a type. Continuing...`);
        continue;
      }

      let handler: MsgHandler | undefined = undefined;

      if (incomingMessage.body && "type" in incomingMessage.body && incomingMessage.body.type === "init") {
        // Message body is of type "init", so use the default handler for that.
        handler = this.handleInitMsg;
      } else {
        // Otherwise, check our handlers for the given message body's type.
        // If our map of handlers does not have an entry for the key 'msgType', handler will be set to 'undefined'.
        handler = this.handlers.get(msgType);
      }

      if (!handler) {
        console.error(`Received a message of type ${msgType} but did not have a handler for it. Continuing...`);
        continue;
      }

      // Finally, handle the message.
      this.handleMessage(handler, incomingMessage);
    }
  }
};

export function isMaelstromMessage(value: any): value is MaelstromMsg {
  return value !== undefined && value !== null
    && ("src"  in value && value.src  !== null)
    && ("dest" in value && value.dest !== null)
    && ("body" in value && value.body !== null);
}

export function isInitMessageBody(value: any): value is InitMsgBody {
  return value !== undefined && value !== null
    && ("type"     in value && value.type === "init")
    && ("node_id"  in value && value.node_id !== null && value.node_id !== undefined)
    && ("node_ids" in value && value.node_id !== null && value.node_ids !== undefined)
    && ("msg_id"   in value && value.msd_id !== null && value.msg_id !== undefined);
}

export function isEchoMessageBody(value: any): value is EchoMsgBody {
  throw new Error("TODO - Not implemented");
}

export type MsgHandler = (msg: MaelstromMsg) => Promise<void | Error>;

// Message sent from node `src` to node `dest`.
// Following the go implementation, body is left unparsed as type `any`
//  so that handler funcs can deal with it.
export type MaelstromMsg = {
  src?: NodeId;  // Source, the ID of the origin node
  dest?: NodeId; // Destination, the ID of the node
  body?: any; // Unparsed, expect JSON object
};

// Our messages, where we can guarantee that our fields will be defined.
export type MaelstromMsgOutgoing = {
  src: NodeId; // Will always be `this` node.
  dest: NodeId;
  body: MessageBody | InitMsgBody | EchoMsgBody;
};

export const getMessageType = (msg: MaelstromMsg): MessageType | null => msg.body?.type ?? null;

export type MessageType = "error" | "echo" | "init" | "init_ok"; // TODO - Add other types
export type MessageId = number;
export type NodeId = `n${number}`; // Example "n1", "n2"
export type ClusterId = `c${number}`; // Example "c1", "c2"

export type MessageBody = {
  type: MessageType; // Type of message
  msg_id?: MessageId; // Unique integer identifier for this message
  in_reply_to?: MessageId; // For request/response, the msg_id of the request being responded to
  code?: number; // Error code, or none if no error occurred
  text?: string; // Error message, or none if no error occurred
};

export type InitMsgBody = MessageBody & {
  type: "init"
  node_id: NodeId; // ID of this node, example "n3"
  node_ids: NodeId[]; // IDs of all nodes in the cluster including this one. Example ["n1", "n2", "n3"]
};

export type EchoMsgBody = MessageBody & {
  type: "echo";
  msg_id?: MessageId;
  echo?: string; // Text to echo
};

// See https://github.com/jepsen-io/maelstrom/blob/main/doc/protocol.md#errors
export type MaelstromError =
  | { code:  0, name: "timeout" }
  | { code:  1, name: "node-not-found" }
  | { code: 10, name: "not-supported" }
  | { code: 11, name: "temporarily-unavailable" }
  | { code: 12, name: "malformed-request" }
  | { code: 13, name: "crash" }
  | { code: 14, name: "abort" }
  | { code: 20, name: "key-does-not-exist" }
  | { code: 21, name: "key-already-exists" }
  | { code: 22, name: "precondition-failed" }
  | { code: 30, name: "txn-conflict" };

