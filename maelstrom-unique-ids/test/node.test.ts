import { beforeEach, describe, it, expect, spyOn, Mock } from "bun:test";
import { InitMsgBody, MaelstromMsg, Node } from "../node";
import { FileSink } from "bun";

describe("Node class", function () {
  let output: FileSink;
  let outputSpy: Mock<(content: string) => void>;

  beforeEach(function () {
    // Reset our output & spy with each test
    output = Bun.stdout.writer();
    outputSpy = spyOn(output, "write");
  });

  it("initializes its fields when calling constructor", function () {
    const node: Node = new Node(undefined, output);
  
    expect(node).toBeDefined();
    expect(node.id).toEqual(null);
    expect(node.nodeIds).toEqual(null);
    expect(node.handlers).toBeDefined();
    expect(node.handlers.size).toEqual(0);
    expect(node.callbacks.size).toEqual(0);
  });

  it("initializes itself when the default handler for init messages is called", function () {
    const message: MaelstromMsg = {
      src: "n0",
      dest: "n1",
      body: {
        type: "init",
        msg_id: 42,
        node_id: "n1",
        node_ids: ["n1", "n2", "n3", "n5", "n8"]
      },
    };

    const node = new Node(undefined, output);

    const result = node.handleInitMsg(message);

    expect(result instanceof Error).toBeFalse();
    expect(node.id).toEqual((message.body as InitMsgBody).node_id);
    expect(node.nodeIds).toEqual((message.body as InitMsgBody).node_ids);

    // When the Node receives an `init` message, we expect it to respond
    //  by writing to stdout.
    // First call is the actual message, second call is the single new-line character.
    expect(outputSpy).toHaveBeenCalledTimes(2);
  });

  it("has a public `send` method to send a new message to the injected output", async function () {
    const node = new Node(undefined, output);

    // We haven't initialized the node yet, so this should return an error.
    let result = await node.send("n1", "hello world!");
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toInclude("we haven't been initialized yet");
    expect((result as Error).message).toInclude("Our ID is 'null'");
    expect(outputSpy).toHaveBeenCalledTimes(0);

    // Initialize the node and try again
    node.initialize("n1", ["n1", "n3", "n5"]);
    result = await node.send("n1", "hello world!");
    expect(result instanceof Error).toBeFalse();
    expect(outputSpy).toHaveBeenCalledTimes(2);
  })
});


describe("Integration tests for Node class", function () {
  let output: FileSink;
  let outputSpy: Mock<(content: string) => void>;

  beforeEach(async function () {
    // Reset our output & spy with each test
    output = Bun.stdout.writer();
    outputSpy = spyOn(output, "write");
  });

  // Use this to create your mocked stdin, pass it an array of messages
  //  that will then 'stream in' as the Node instance iterates over its input source
  function createTestInput(messages: MaelstromMsg[]): AsyncIterable<string> {
    return {
      async *[Symbol.asyncIterator]() {
        for (const message of messages) {
          yield JSON.stringify(message);
        }
      }
    }
  }

  it("Initializes itself when receiving an `init` message", async function () {
    const initMessage: MaelstromMsg = {
      src: "n1",
      dest: "n2",
      body: {
        type: "init",
        msg_id: 42,
        node_id: "n2",
        node_ids: ["n1", "n2", "n3", "n5", "n8"]
      },
    };

    const input: AsyncIterable<string> = createTestInput([initMessage]);

    const n = new Node(input, output);

    await n.run();

    expect(n.id).toEqual((initMessage.body as InitMsgBody).node_id);
    expect(outputSpy).toHaveBeenCalledTimes(2);
  });

  it("Responds to an `echo` message with a body that contains the designated echo text", async function () {
    
  });
});

