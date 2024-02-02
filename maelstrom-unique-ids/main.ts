import { MaelstromMsg, Node } from "./node";

const n = new Node();

n.registerHandle("echo", async (msg: MaelstromMsg): Promise<void | Error> => {
  const replyBody = {
    ...msg.body
  };

  replyBody["type"] = "echo_ok";

  return await n.replyToMsg(msg, replyBody);
});

try {
  n.run();
} catch (e: any) {
  console.error(e);
  process.exit(1);
}

