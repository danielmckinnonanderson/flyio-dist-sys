import { MaelstromMessage, MsgHandler, Node } from "./node";

const echoHandler: MsgHandler = (msg: MaelstromMessage): void | Error => {
};

const n = new Node();
n.registerHandle("echo", (msg: MaelstromMessage): void | Error => {
  const replyBody = {
    ...msg.body
  };

  replyBody["type"] = "echo_ok";

  // return n.reply(msg, body);
});

try {
  n.run();
} catch (e: any) {
  console.error(e);
  process.exit(1);
}

