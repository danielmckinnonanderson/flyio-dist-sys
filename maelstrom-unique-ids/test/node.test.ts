import { describe, it, expect } from "bun:test";
import { InitMsgBody, MaelstromMessage, Node } from "../node";

describe("Node class", function () {
  
  it("initializes its fields to null when calling constructor", function () {
    const node = new Node();
    
    expect(node).toBeDefined();
    expect(node.getId()).toEqual(null);
    expect(node.getNodeIds()).toEqual(null);
    expect(node.handlers).toBeDefined();
    expect(node.handlers.size).toEqual(0);
    expect(node.callbacks).toBeDefined();
    expect(node.callbacks.size).toEqual(0);
  });

  it("responds to an init message by initializing its fields", function () {
    const node = new Node();

    const message: MaelstromMessage = {
      src: "0",
      dest: "1",
      body: {
        type: "init",
        msg_id: 42,
        node_id: "1",
        node_ids: [],
      },
    };

    const result = node.initialize(message);
    expect(node)
  });
});

