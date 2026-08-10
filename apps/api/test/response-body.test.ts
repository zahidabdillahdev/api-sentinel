import { describe, expect, it } from "vitest";
import {
  discardResponseBody,
  readResponseBody,
  ResponseBodyTooLargeError,
} from "../src/lib/response-body.js";

describe("bounded response bodies", () => {
  it("reads a body within the configured limit", async () => {
    const response = new Response('{"status":"ok"}');

    await expect(readResponseBody(response, 100)).resolves.toBe(
      '{"status":"ok"}',
    );
  });

  it("rejects a declared body larger than the configured limit", async () => {
    const response = new Response("small", {
      headers: { "content-length": "1000" },
    });

    await expect(readResponseBody(response, 100)).rejects.toBeInstanceOf(
      ResponseBodyTooLargeError,
    );
  });

  it("stops a streamed body after crossing the configured limit", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(60));
          controller.enqueue(new Uint8Array(60));
          controller.close();
        },
      }),
    );

    await expect(readResponseBody(response, 100)).rejects.toThrow(
      "Response body exceeded the 100-byte safety limit",
    );
  });

  it("cancels an unused body without buffering it", async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    );

    await discardResponseBody(response);
    expect(cancelled).toBe(true);
  });
});
