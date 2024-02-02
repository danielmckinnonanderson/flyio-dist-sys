import { beforeEach, describe, it, expect, spyOn, Mock, afterEach } from "bun:test";
import { InitMsgBody, MaelstromMsg, Node } from "../node";
import { FileSink } from "bun";

describe("Node class", function () {
  const outputFile = Bun.file("./unit_test_output.txt");
  let output: FileSink;
  let outputSpy: Mock<(content: string) => void>;

  beforeEach(function () {
    // Reset our output & spy with each test
    output = outputFile.writer();
    outputSpy = spyOn(output, "write");
  });

  afterEach(async function () {
    await output.end();
  })

  it("initializes its fields when calling constructor", function () {
    const node: Node = new Node(undefined, output);
  
    expect(node).toBeDefined();
    expect(node.id).toEqual(null);
    expect(node.nodeIds).toEqual(null);
    expect(node.handlers).toBeDefined();
    expect(node.handlers.size).toEqual(0);
    expect(node.callbacks.size).toEqual(0);
  });

  it("initializes itself when the default handler for init messages is called", async function () {
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

    const outputText = await outputFile.text();
    const parsedOutput = JSON.parse(outputText);
    expect(parsedOutput).toBeDefined();
    expect(parsedOutput["src"]).toEqual(node.id);
    expect(parsedOutput["dest"]).toEqual(message.src);
    expect(parsedOutput["body"]["type"]).toEqual("init_ok");
    expect(parsedOutput["body"]["in_reply_to"]).toEqual(message.body.msg_id);
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


describe.skip("Integration tests for Node class", function () {
  const testOutputFile = Bun.file("./test_output.txt");
  let output: FileSink;
  let outputSpy: Mock<(content: string) => void>;

  beforeEach(async function () {
    // Reset our output & spy with each test
    // TODO - How can we setup our test output so that we can actually verify the content?
    if (await testOutputFile.exists()) {
      // Delete our test output file (if it exists) between tests
    }
    
    output = testOutputFile.writer();
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

  const initMessage: MaelstromMsg =  {
    src: "n1",
    dest: "n2",
    body: {
      type: "init",
      msg_id: 42,
      node_id: "n2",
      node_ids: ["n1", "n2", "n3", "n5", "n8"]
    }
  };

  it("Initializes itself when receiving an `init` message", async function () {
    const input: AsyncIterable<string> = createTestInput([initMessage]);

    const n = new Node(input, output);

    try {
      await n.run();
    } catch (error: any) {}

    expect(outputSpy).toHaveBeenCalledTimes(2);
  });
});

