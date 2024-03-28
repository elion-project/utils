import { LoggerLevels, LoggerLevelsArray, LoggerMessage } from "./types.js";
import { Optional } from "../types.js";

export type LoggerOptions = {
    name?: string;
    level?: LoggerLevels;
    callback?: (info: LoggerMessage) => void | Promise<void>;
    parentLogger?: Logger;
};

export type LoggerChildOptions = Optional<
    Required<Omit<LoggerOptions, "callback">>,
    "level"
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
            this.level = options.level ?? this.options.parentLogger.level;
            this.callback = this.options.parentLogger.callback.bind(
                this.options.parentLogger,
            );
        } else {
            this.level = this.options.level ?? "info";
            this.callback = this.options.callback ?? (() => {});
            this.name = this.options.name ?? "";
            this.nameLevel = [this.name];
        }
    }

    public child(options: Omit<LoggerChildOptions, "parentLogger">): Logger;
    public child(name: string): Logger;

    public child(arg: any): Logger {
        if (typeof arg === "string") {
            return this.child({
                name: arg,
                parentLogger: this,
            } as Omit<LoggerChildOptions, "parentLogger">);
        }
        return new Logger({
            ...(arg as Omit<LoggerChildOptions, "parentLogger">),
            parentLogger: this,
        });
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

    /**
     * Logs error messages.
     * Use this logger level to log errors that occur during your program's execution.
     * @param message The error message(s) to log
     */
    public error(...message: any[]) {
        this.execute("error", ...message);
    }

    /**
     * Logs warning messages.
     * Use this logger level to log non-error messages that could potentially lead to application errors.
     * @param message The warning message(s) to log
     */
    public warn(...message: any[]) {
        this.execute("warn", ...message);
    }

    /**
     * Logs basic information messages.
     * Use this logger level for informational messages to track your application's normal behavior.
     * @param message The information message(s) to log
     */
    public info(...message: any[]) {
        this.execute("info", ...message);
    }

    /**
     * Also logs informational messages. The same as the info logger level.
     * @param message The message(s) to log
     */
    public log(...message: any[]) {
        this.execute("info", ...message);
    }

    /**
     * Logs HTTP requests.
     * Use this logger level to log the details of HTTP requests and responses.
     * @param message The HTTP request/response message(s) to log
     */
    public http(...message: any[]) {
        this.execute("http", ...message);
    }

    /**
     * Provides detailed logs. Use this logger level for detailed debug information beyond what you'd log for debugging.
     * @param message The message(s) to log in verbose mode
     */
    public verbose(...message: any[]) {
        this.execute("verbose", ...message);
    }

    /**
     * Logs debug-level messages. Use this logger level to log information helpful in debugging.
     * @param message The debug message(s) to log
     */
    public debug(...message: any[]) {
        this.execute("debug", ...message);
    }

    /**
     * Provides the most detailed logs.
     * This is the highest level of logging and includes all levels of messages.
     * @param message The message(s) to log in silly mode
     */
    public silly(...message: any[]) {
        this.execute("silly", ...message);
    }

    /**
     * Also provides the most detailed logs.
     * The same as the silly logger level.
     * @param message The message(s) to log in trace mode
     */
    public trace(...message: any[]) {
        this.execute("silly", ...message);
    }
}

export interface ILogger {
    new (options?: LoggerOptions): Logger;
    child(options: LoggerChildOptions): Logger;
}
