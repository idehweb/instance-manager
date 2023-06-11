class SSE {
  constructor(res) {
    this.res = res;
    this.#registerClient();
  }
  sendData(data) {
    if (!this.res || !this.res.writable) return false;
    this.res.write(`${JSON.stringify({ type: "data", data })}\n\n`);
    return true;
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
}

export default SSE;
