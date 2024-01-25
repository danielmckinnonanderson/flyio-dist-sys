class Node {
  id: string | null = null;
  nodeIds: string[] | null = null;
  nextMsgId: number | null = null;

  handlers: Map<MaelstromType, MsgHandler>;

  callbacks: Map<number, MsgHandler>;

  input: typeof Bun.stdin = Bun.stdin;
  output: typeof Bun.stdout = Bun.stdout;

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

  public registerHandle(type: string, fn: MsgHandler): void {
    if (this.handlers.has(type)) throw new Error(`Tried to register a duplicate handler. Already had handler for ${type}.`);
    this.handlers.set(type, fn);
  }

  public run(): void {
    for (const line in this.input) {
      if (isMaelstromMessage(line)) {
        const message = line as MaelstromMsg; 
        console.log(message);
      }
    }
  }
};

function isMaelstromMessage(value: any): value is MaelstromMsg {
  // TODO - Make this more robust to ensure strict typing
  return typeof value === "object"
    && value !== undefined && value !== null
    && "src" in value && "dest" in value
    && "body" in value;
};

type MsgHandler = (msg: MaelstromMsg) => any;

type MaelstromMsg = {
  src?: string;  // Source, the name of the origin cluster
  dest?: string; // Destination, the name of the node
  body?: any; // TODO - Update type based on different message types
};

type MaelstromType = "echo" | string; // TODO - Add types

type EchoMsgBody = {
  type: "echo";
  msg_id: number;
  echo: string;
};

type EchoRespBody = EchoMsgBody & {
  in_reply_to: string;
};

