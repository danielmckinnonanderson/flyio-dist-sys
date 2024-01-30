
// Maelstrom Node specification
// https://github.com/jepsen-io/maelstrom/blob/main/doc/protocol.md
export class Node {
  id: string | null = null;
  nodeIds: string[] | null = null;
  nextMsgId: number | null = null;

  handlers: Map<MessageType, MsgHandler> = new Map();
  callbacks: Map<number, MsgHandler> = new Map();

  private output = Bun.stdout.writer();

  public constructor() {}

  public initialize(id: string, nodeIds: string[]): void {
    this.id = id;
    this.nodeIds = nodeIds;
  }

  public getId(): typeof this.id {
    return this.id;
  }

  public getNodeIds(): typeof this.nodeIds {
    return this.nodeIds;
  }

  public registerHandle(type: MessageType, fn: MsgHandler): void | Error {
    if (this.handlers.has(type)) {
      return new Error(`Tried to register a duplicate handler. Already had handler for ${type}.`);
    }

    this.handlers.set(type, fn);
  }

  // Default handler for init messages.
  // Parse the message body and initialize self according to its parameters.
  public async handleInitMsg(msg: MaelstromMessage): Promise<void | Error> {
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

    this.initialize(body.node_id, body.node_ids);

    // If application has provided a handler override for init, use that.
    if (this.handlers.has("init")) {
      const result: void | Error = await this.handlers.get("init")!(msg);
      if (result instanceof Error) {
        return result as Error;
      }
    }

    // Send response that this node has been initialized successfully
    return this.reply(msg, { type: "init_ok" });
  }

  // Reply to the given message with a response body
  public async reply(request: MaelstromMessage, body: MessageBody | Error): Promise<void | Error> {
    const reqBody: MessageBody = request.body!;

    if (request.src === null || request.src === undefined) {
      return new Error(`Tried to reply to message with ID ${reqBody.msg_id}, but it didn't have a source. Source was ${request.src}`);
    }

    
    if (body instanceof Error) {
      // FIXME
      return this.send(request.src, {});
    } else {
      const respBody: MessageBody = body;
      respBody["in_reply_to"] = reqBody.msg_id;

      return this.send(request.src, respBody);
    }
  }

  public async send(destination: string, body: any): Promise<void | Error> {
    const outgoing: MaelstromMessage = {
      src: this.id!,
      dest: destination,
      body: body,
    };

    try {
      this.output.write(JSON.stringify(outgoing) + "\n");
    } catch (error: any) {
      return new Error(error);
    }
  }

  public async run(): Promise<void | Error> {
    for await (const line of console) {
      const parsed: any = JSON.parse(line);

      if (!isMaelstromMessage(parsed)) {
        // TODO - Log error and then continue rather than erroring out
        return new Error(`Tried to ingest input as message, but couldn't. Input was ${line}.`);
      }

      const message = parsed as MaelstromMessage;

      if (message.body === null || message.body === undefined) {
        // TODO - Log error and then continue rather than erroring out
        return new Error(`Message body was not present, body was ${message.body}`);
      }

      // Determine handler to use for the received message
      if (message.body !== null && message.body !== undefined 
      && message.body.in_reply_to !== null && message.body.in_reply_to !== undefined 
      && message.body.in_reply_to !== 0) {
        // Save myself some typing
        const replyingTo = message.body.in_reply_to;

        // Extract callback if replying to previous message
        const handler = this.callbacks.get(replyingTo);
        if (handler === undefined) {
          // If no callback exists, log message and continue 
          // TODO - Log "Ignoring reply to ${replyingTo} with no callback"
          continue;
        }
        // Callback exists, handle it and then delete it
        this.callbacks.delete(replyingTo);
        this.handleCallback(handler, message);

      }

      // Not a callback. Ensure a handler is registered for the given type
      const handler = message.body.type === "init"
        ? this.handleInitMsg
        : this.handlers.get(message.body.type);

      if (handler === null || handler === undefined) {
        return new Error(`Didn't have a handler registered for message type ${message.body.type}`);
      }

      this.handleMessage(handler, message);
    }
  }

  public async handleCallback(handler: MsgHandler, msg: MaelstromMessage): Promise<void | Error> {
    return handler(msg);
  }

  public async handleMessage(handler: MsgHandler, msg: MaelstromMessage): Promise<void | Error> {
    const result = await handler(msg);

    if (result instanceof Error) {
      return this.reply(msg, result);
    }
  }
};

export function isMaelstromMessage(value: any): value is MaelstromMessage {
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

export type MsgHandler = (msg: MaelstromMessage) => Promise<void | Error>;

// Message sent from node `src` to node `dest`.
// Following the go implementation, body is left unparsed as type `any`
//  so that handler funcs can deal with it.
export type MaelstromMessage = {
  src?: string;  // Source, the name of the origin cluster
  dest?: string; // Destination, the name of the node
  body?: EchoMsgBody | InitMsgBody;    // Unparsed, expect JSON object
};
export const getMessageType = (msg: MaelstromMessage): MessageType | null => msg.body?.type ?? null;
export type MessageType = "error" | "echo" | "init" | "init_ok"; // TODO - Add other types
export type MessageId = number;
export type NodeId = string;

export type MessageBody = {
  type: MessageType; // Type of message
  msg_id?: MessageId; // Unique integer identifier for this message
  in_reply_to?: MessageId; // For request/response, the msg_id of the request being responded to
  code?: number; // Error code, or none if no error occurred
  text?: string; // Error message, or none if no error occurred
};

export type InitMsgBody = MessageBody & {
  type: "init"
  node_id?: NodeId; // ID of this node, example "n3"
  node_ids?: NodeId[]; // IDs of the other nodes in the cluster, example ["n1", "n2"]
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

