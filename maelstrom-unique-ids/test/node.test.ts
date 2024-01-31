import { describe, it, expect, spyOn, Mock } from "bun:test";
import { InitMsgBody, MaelstromMessage, Node } from "../node";
import { FileSink } from "bun";

describe("Node class", function () {

  const output: FileSink = Bun.stdout.writer();
  const outputSpy: Mock<(content: string) => void> = spyOn(output, "write");

  it("initializes its fields when calling constructor", function () {
    const node: Node = new Node(undefined, output);
  
    expect(node).toBeDefined();
    expect(node.getId()).toEqual(null);
    expect(node.getNodeIds()).toEqual(null);
    expect(node.handlers).toBeDefined();
    expect(node.handlers.size).toEqual(0);
  });

  it("has a public `send` method to send a new message to the injected output", function () {
    const node = new Node(undefined, output);

    node.send("c1", "hello world!");
    expect(outputSpy).toHaveBeenCalledTimes(1);
  })

  it("initializes itself when the default handler for init messages is called", function () {
    const message: MaelstromMessage = {
      src: "0", dest: "1",
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
    expect(node.getId()).toEqual((message.body as InitMsgBody).node_id);
    expect(node.getNodeIds()).toEqual((message.body as InitMsgBody).node_ids);

    // When the Node receives an `init` message, we expect it to respond
    //  by writing to stdout.
    expect(outputSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Integration tests for Node class", function () {

  const output: FileSink = Bun.stdout.writer();
  const outputSpy: Mock<(content: string) => void> = spyOn(output, "write");

  it("Initializes itself when receiving an `init` message", function () {
    const request: MaelstromMessage = {
      src: "0",
      dest: "c1",
      body: {
        type: "init",
        msg_id: 42,
        node_id: "n1",
        node_ids: ["n1", "n2", "n3", "n5", "n8"]
      },
    };

    const input: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify(request);
      }
    };

    const n = new Node(input, output);

    n.run();

    expect(n.id).toEqual((request.body as InitMsgBody).node_id);
    expect(n.id).toEqual((request.body as InitMsgBody).node_id);
    expect(outputSpy).toHaveBeenCalledTimes(1);
  });
});

