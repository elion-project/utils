import Heath from "./heathServer.assist";

export type CbOptions = {
    name: string;

    health: {
        setOnLive: (LiveCheckFunction: () => Promise<void>) => void;
        onReady: (ReadyCheckFunction: () => Promise<void>) => void;
    };
};

export type AssistOptions = {
    health?: {
        port?: number;
    };
};
export default class Assist {
    private init: (options: CbOptions) => Promise<void>;

    private options: AssistOptions;

    private healthServer: Heath;

    constructor(
        init: (options: CbOptions) => Promise<void>,
        options: AssistOptions
    ) {
        this.init = init;
        this.options = options;
        this.healthServer = new Heath(
            this.options.health?.port ?? 9091,
            () => {},
            () => {}
        );

        // Register on break function
        process.on("SIGBREAK", this.stop.bind(this));
        process.on("SIGTERM", this.stop.bind(this));
    }

    async stop(code) {
        await this.healthServer.stop();
    }
}
