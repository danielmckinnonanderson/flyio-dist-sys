import { MsgHandler, Node } from "./node";

const echoHandler: MsgHandler = function () {
  console.log("...");
};

const n = new Node();
n.registerHandle("echo", echoHandler);

try {
  n.run();
} catch (e: any) {
  console.error(e);
  process.exit(1);
}

