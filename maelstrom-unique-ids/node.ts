// Maelstrom Node specification
// https://github.com/jepsen-io/maelstrom/blob/main/doc/protocol.md
export class Node {
  id: string | null = null;
  nodeIds: string[] | null = null;
  nextMsgId: number | null = null;

  handlers: Map<MessageType, MsgHandler>;

  callbacks: Map<number, MsgHandler>;

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

  public handleInitMsg(msg: any): void | Error {
    const body = msg;
  }

  public async run(): Promise<void | Error> {
    for await (const line of console) {
      const parsed: any = JSON.parse(line);
      console.info(parsed);

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
          console.log(`Ignoring reply to ${replyingTo}, since it has no callback.`);
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

export type EchoMsgBody = {
  type?: "echo";
  msg_id?: number;
  echo?: string;
};

