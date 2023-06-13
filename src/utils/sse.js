class SSE {
  constructor(res) {
    this.res = res;
    this.#registerClient();
  }
  #write(data, type) {
    if (!this.res || !this.res.writable) return false;
    this.res[type === "close" ? "send" : "write"](
      `${JSON.stringify({ type, data })}\n\n`
    );
    return true;
  }
  sendData(data) {
    return this.#write(data, "data");
  }
  #registerClient() {
    // set sse headers
    const headers = {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    };
    this.res.writeHead(200, headers);

    // handle on close
    this.res.on("close", () => {
      // when connection closed
      console.log("connection closed");
      this.res = null;
    });

    // first handshake and define separator
    this.res.write(
      `${JSON.stringify({
        type: "handshaking",
        data: "connection accept",
        separator: "\n\n",
      })}\n\n`
    );
  }
  close() {
    return this.#write({ message: "connection closed" }, "close");
  }
}

export default SSE;
