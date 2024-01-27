
// Maelstrom Node specification
// https://github.com/jepsen-io/maelstrom/blob/main/doc/protocol.md
export class Node {
  id: string | null = null;
  nodeIds: string[] | null = null;
  nextMsgId: number | null = null;

  handlers: Map<MessageType, MsgHandler>;
  callbacks: Map<number, MsgHandler>;

  stdout = Bun.stdout.writer();

  public constructor() {
    this.handlers = new Map();
    this.callbacks = new Map();
  }

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
  public handleInitMsg(msg: MaelstromMessage): void | Error {
    const body: InitMsgBody = msg.body;
    if (body === null || body === undefined) {
      return new Error(`I was assured that the body for init message would be present, but it wasn't. Body was ${body}`);
    }
    if (body.node_id === undefined || body.node_id === null) {
      return new Error(`Init message body did not provide a 'node_id', instead 'node_id' was ${body.node_id}`);
    }
    if (body.node_ids === undefined || body.node_ids === null) {
      return new Error(`Init message body did not provide 'node_ids', instead 'node_ids' was ${body.node_id}`);
    }

    this.initialize(body.node_id, body.node_ids);

    // If application has provided a handler override for init, use that.
    if (this.handlers.has("init")) {
      const result: void | Error = this.handlers.get("init")!(msg);
      if (result instanceof Error) {
        return result as Error;
      }
    }

    // Send response that this node has been initialized successfully
    // console.log(`Node ${this.id} is initialized`);
    return this.reply(msg, { type: "init_ok" });
  }

  // Reply to the given message with a response body
  public reply(request: MaelstromMessage, body: any): void | Error {
    const reqBody: MessageBody = request.body;
    if (request.src === null || request.src === undefined) {
      return new Error(`Tried to reply to message with ID ${reqBody.msg_id}, but it didn't have a source. Source was ${request.src}`);
    }
    
    const respBody: MessageBody = body;
    respBody["in_reply_to"] = reqBody.msg_id;

    return this.send(request.src, respBody);
  }

  public send(destination: string, body: any): void | Error {
    const outgoing: MaelstromMessage = {
      src: this.id!,
      dest: destination,
      body: body,
    };

    try {
      this.stdout.write(JSON.stringify(outgoing) + "\n");
    } catch (error: any) {
      return new Error(error);
    }
  }

  public async run(): Promise<void | Error> {
    for await (const line of console) {
      const parsed: any = JSON.parse(line);

      if (!isMaelstromMessage(parsed)) {
        return new Error(`Tried to ingest input as message, but couldn't. Input was ${line}.`);
      }

      const message = line as MaelstromMessage;

      // Determine handler to use for the received message
      if (message.body !== null && message.body !== undefined 
      && message.body.in_reply_to !== null && message.body.in_reply_to !== undefined 
      && message.body.in_reply_to !== 0) {
        // Save myself some typing
        const replyingTo = message.body.in_reply_to;

        // Extract callback if replying to previous message
        const handler = this.callbacks.get(replyingTo);
        this.callbacks.delete(replyingTo);

        // If no callback exists, log message and continue 
        if (handler === undefined || handler === null) {
          // console.log(`Ignoring reply to ${replyingTo}, since it has no callback.`);
          continue;
        }

        // Go implementation uses a goroutine, what is the most idiomatic
        //  way to handle that for us?
      }
    }
  }
};

function isMaelstromMessage(value: any): value is MaelstromMessage {
  return value !== undefined && value !== null
    && ("src"  in value && value.src  !== null)
    && ("dest" in value && value.dest !== null)
    && ("body" in value && value.body !== null);
};

export type MsgHandler = (msg: MaelstromMessage) => void | Error;

// Message sent from node `src` to node `dest`.
// Following the go implementation, body is left unparsed as type `any`
//  so that handler funcs can deal with it.
export type MaelstromMessage = {
  src?: string;  // Source, the name of the origin cluster
  dest?: string; // Destination, the name of the node
  body?: any;    // Unparsed, expect JSON object
};

export const getMessageType = (msg: MaelstromMessage): string => msg.body?.type ?? "";

export type MessageType = "echo" | "init"; // TODO - Add types

export type MessageBody = {
  type?: MessageType;
  msg_id?: number;
  in_reply_to?: number;
  code?: number; // Error code, or none if no error occurred
  text?: string; // Error message, or none if no error occurred
};

export type InitMsgBody = MessageBody & {
  type: "init"
  node_id?: string;
  node_ids?: string[];
};

export type EchoMsgBody = MessageBody & {
  type: "echo";
  msg_id?: number;
  echo?: string;
};

