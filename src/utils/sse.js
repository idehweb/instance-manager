class SSE {
  constructor(res) {
    this.res = res;
    this.#registerClient();
    const heartbeat = setInterval(this.#heartbeat, 15_000);
    this.res.on("close", () => {
      if (heartbeat) clearInterval(heartbeat);
    });
  }

  #heartbeat = () => {
    this.#write("comment", "heartbeat");
  };

  #write(data, type) {
    if (!this.res || !this.res.writable) return false;
    // this.res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    if (type === "close") {
      this.res.end();
    }
    return true;
  }
  #writeHead(headers) {
    if (!this.res || !this.res.writable) return false;
    this.res.writeHead(200, headers);
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
      "Access-Control-Allow-Origin": "*",
    };
    this.#writeHead(headers);

    // handle on close
    this.res.on("close", () => {
      // when connection closed
      this.res = null;
    });

    // first handshake and define separator
    const padding = new Array(2049);
    this.res.write(":" + padding.join(" ") + "\n"); // 2kB padding for IE
    this.res.write("retry: 2000\n");
  }
  close() {
    return this.#write({ message: "connection closed" }, "close");
  }
}

export default SSE;
