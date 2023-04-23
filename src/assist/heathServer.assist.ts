import fastify, {
    FastifyInstance,
    RawReplyDefaultExpression,
    RawRequestDefaultExpression,
} from "fastify";
import http from "http";

export default class Heath {
    private _probeServer: FastifyInstance<
        http.Server,
        RawRequestDefaultExpression<http.Server>,
        RawReplyDefaultExpression<http.Server>
    > &
        PromiseLike<
            FastifyInstance<
                http.Server,
                RawRequestDefaultExpression<http.Server>,
                RawReplyDefaultExpression<http.Server>
            >
        >;

    private _onLive: () => void;

    private _onReady: () => void;

    private _port: number;

    constructor(port: number, onReady: () => void, onLive: () => void) {
        this._port = port;
        this._onReady = onReady;
        this._onLive = onLive;
        this._probeServer = fastify();
        this._probeServer.get("/livez", async (req, reply) => {
            try {
                await onLive();
                reply.code(200);
            } catch (e) {
                reply.code(500);
                return e;
            }
            return "live";
        });
        this._probeServer.get("/readyz", async (req, reply) => {
            try {
                await onLive();
                reply.code(200);
            } catch (e) {
                reply.code(500);
                return e;
            }
            return "Ready";
        });
    }

    set onLive(value: () => void) {
        this._onLive = value;
    }

    set onReady(value: () => void) {
        this._onReady = value;
    }

    async start() {
        return this._probeServer.listen({
            port: this._port,
        });
    }

    async stop() {
        return this._probeServer.close();
    }
}
