import * as net from "node:net";
import * as tls from "node:tls";

export class Socket {
  private static socketInstanceMap: Map<string, Socket> = new Map();
  private socket: net.Socket;

  static get(secure: boolean, host: string, port: number): Socket {
    if (this.socketInstanceMap.has(host)) {
      return this.socketInstanceMap.get(host)!;
    }
    const instance = new Socket(secure, host, port);
    this.socketInstanceMap.set(host, instance);
    return instance;
  }

  private constructor(secure: boolean, host: string, port: number) {
    this.socket = secure
      ? tls.connect({ host, port, servername: host })
      : new net.Socket();
    if (!secure) {
      this.socket.connect({ host, port });
    }
  }

  write(data: string, encoding: BufferEncoding = "utf8") {
    this.socket.write(data, encoding);
  }

  destroy(host: string) {
    this.socket.destroy();
    Socket.socketInstanceMap.delete(host);
  }

  readAll(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.socket.on("data", (chunk: Buffer) => chunks.push(chunk));
      this.socket.on("end", () => resolve(Buffer.concat(chunks)));
      this.socket.on("error", reject);
    });
  }
}
