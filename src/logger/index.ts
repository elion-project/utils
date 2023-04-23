export type LoggerLevels =
    | "error"
    | "warn"
    | "info"
    | "http"
    | "verbose"
    | "debug"
    | "silly";

export const LoggerLevelsArray: LoggerLevels[] = [
    "error",
    "warn",
    "info",
    "http",
    "verbose",
    "debug",
    "silly",
];

const compatibilityLevels = {
    error: console.error,
    warn: console.warn,
    info: console.info,
    log: console.log,
    http: console.log,
    verbose: console.log,
    debug: console.debug,
    silly: console.log,
};

const generateLevelInput = (level: string, size = 5) =>
    `${Array.from({ length: size - level.length }, () => " ").join(
        ""
    )}${level}`;

export function consoleLogTransport(info: LoggerMessage): void | Promise<void> {
    compatibilityLevels[info.level](
        `(${new Date().toLocaleString()}) ${generateLevelInput(
            info.level
        )} [${info.meta.level.join(" > ")}]:`,
        ...info.message
    );
}

export type LoggerMessage = {
    level: LoggerLevels;
    message: any[];
    meta: {
        level: string[];
        [x: string]: any;
    };
};

export type LoggerOptions = {
    name?: string;
    level?: LoggerLevels;
    callback?: (info: LoggerMessage) => void | Promise<void>;
    parentLogger?: Logger;
};

export type LoggerChildOptions = Required<
    Omit<LoggerOptions, "level" | "callback">
>;
export class Logger {
    private options: LoggerOptions;

    public name: string;

    public nameLevel: string[];

    public callback: (info: LoggerMessage) => void | Promise<void>;

    public level: LoggerLevels;

    static child(options: LoggerChildOptions): Logger {
        return new Logger(options);
    }

    constructor(options?: LoggerOptions) {
        this.options = options || {};
        if (this.options.parentLogger) {
            this.name = this.options.name ?? "";
            this.nameLevel = [
                ...this.options.parentLogger.nameLevel,
                this.name,
            ];
            this.level = this.options.parentLogger.level;
            this.callback = this.options.parentLogger.callback.bind(
                this.options.parentLogger
            );
        } else {
            this.level = this.options.level ?? "info";
            this.callback = this.options.callback ?? (() => {});
            this.name = this.options.name ?? "";
            this.nameLevel = [this.name];
        }
    }

    private execute(level: LoggerLevels, ...message: any[]) {
        if (
            LoggerLevelsArray.indexOf(level) <=
            LoggerLevelsArray.indexOf(this.level)
        ) {
            this.callback({
                level,
                message,
                meta: {
                    level: this.nameLevel,
                },
            });
        }
    }

    public error(...message: any[]) {
        this.execute("error", ...message);
    }

    public warn(...message: any[]) {
        this.execute("warn", ...message);
    }

    public info(...message: any[]) {
        this.execute("info", ...message);
    }

    public log(...message: any[]) {
        this.execute("info", ...message);
    }

    public http(...message: any[]) {
        this.execute("http", ...message);
    }

    public verbose(...message: any[]) {
        this.execute("verbose", ...message);
    }

    public debug(...message: any[]) {
        this.execute("debug", ...message);
    }

    public silly(...message: any[]) {
        this.execute("silly", ...message);
    }

    public trace(...message: any[]) {
        this.execute("silly", ...message);
    }
}
