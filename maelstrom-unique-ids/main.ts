import { MaelstromMessage, Node } from "./node";

const n = new Node();

n.registerHandle("echo", (msg: MaelstromMessage): void | Error => {
  const replyBody = {
    ...msg.body
  };

  replyBody["type"] = "echo_ok";

  return n.reply(msg, replyBody);
});

try {
  n.run();
} catch (e: any) {
  console.error(e);
  process.exit(1);
}

