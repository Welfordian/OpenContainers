import { resolvePath } from "../../fs/src/path-utils.js";

export class SyscallRouter {
  constructor({ kernel }) {
    this.kernel = kernel;
  }

  async handle(request, descriptor = { cwd: "/workspace", env: {}, projectId: "default" }) {
    switch (request.op) {
      case "fs.readFileSync":
        return this.kernel.fs.readFileSync(resolvePath(descriptor.cwd, request.path), request.encoding);
      case "fs.writeFileSync":
        this.kernel.fs.writeFileSync(resolvePath(descriptor.cwd, request.path), request.data ?? "", request.options);
        return null;
      case "fs.statSync": {
        const stat = this.kernel.fs.statSync(resolvePath(descriptor.cwd, request.path));
        return {
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          isFile: stat.isFile(),
          isDirectory: stat.isDirectory()
        };
      }
      case "process.spawn": {
        const child = this.kernel.spawn(request.command, request.args ?? [], {
          cwd: request.options?.cwd ?? descriptor.cwd,
          env: { ...descriptor.env, ...(request.options?.env ?? {}) },
          projectId: descriptor.projectId,
          parentPid: descriptor.pid
        });
        return { pid: child.pid };
      }
      case "http.dispatch":
        return this.kernel.dispatchHttpRequest(request.request);
      default:
        throw Object.assign(new Error(`Unsupported syscall: ${request.op}`), {
          code: "ERR_WELFORD_UNKNOWN_SYSCALL"
        });
    }
  }

  async serveOnce(mailbox, descriptor) {
    const request = mailbox.waitForRequest();
    if (!request) return false;
    try {
      mailbox.respond(await this.handle(request, descriptor));
    } catch (error) {
      mailbox.respondError(error);
    }
    return true;
  }
}
