import chalk, { ChalkInstance } from "chalk";
import util from "util";
import { LoggerMessage } from "../types.js";

export type LogLevel = {
    key: string;
    console: (message: string, ...args: any[]) => void;
    chalk: ChalkInstance;
};

const tab = "  ";

const compatibilityLevels: Record<string, LogLevel> = {
    error: {
        key: "error",
        console: console.error,
        chalk: chalk.red,
    },
    warn: {
        key: "warn",
        console: console.warn,
        chalk: chalk.yellowBright,
    },
    info: {
        key: "info",
        console: console.info,
        chalk: chalk.blue,
    },
    log: {
        key: "log",
        console: console.log,
        chalk: chalk.white,
    },
    http: {
        key: "http",
        console: console.log,
        chalk: chalk.white,
    },
    verbose: {
        key: "verbose",
        console: console.log,
        chalk: chalk.white,
    },
    debug: {
        key: "debug",
        console: console.debug,
        chalk: chalk.yellow,
    },
    silly: {
        key: "silly",
        console: console.log,
        chalk: chalk.magenta,
    },
};

const childColors = [
    chalk.blue,
    chalk.cyan,
    chalk.green,
    chalk.magenta,
    chalk.yellow,
];

export const prettyDate = (date: Date) =>
    `${date.getMonth().toString().padStart(2, "0")}-${date
        .getDate()
        .toString()
        .padStart(2, "0")}-${date.getFullYear().toString()} ${date
        .getHours()
        .toString()
        .padStart(2, "0")}:${date
        .getMinutes()
        .toString()
        .padStart(2, "0")}:${date
        .getSeconds()
        .toString()
        .padStart(2, "0")}.${date
        .getMilliseconds()
        .toString()
        .padStart(3, "0")}`;
export const prettyLevel = (level: LogLevel, size = 17) => {
    const levelString = level.chalk(level.key);
    return `${Array.from({ length: size - levelString.length }, () => " ").join(
        "",
    )}${levelString}`;
};

export function prettyChildLevel(steps: string[]) {
    return steps
        .map((step, index) => {
            const color = childColors[index % childColors.length];
            return color(step);
        })
        .join(chalk.gray(" > "));
}

function isShouldBeNotUtilInspect(message: any) {
    return typeof message === "string";
}

export function prettyLogTransport(info: LoggerMessage): void | Promise<void> {
    const prefix = `(${prettyDate(new Date())}) ${prettyLevel(
        compatibilityLevels[info.level],
    )} [${prettyChildLevel(info.meta.level)}]:${tab}`;
    if (typeof window === "undefined" && process && !process.env.DEBUG) {
        compatibilityLevels[info.level].console(
            `${prefix}${info.message
                .map((message) =>
                    isShouldBeNotUtilInspect(message)
                        ? message
                        : util.inspect(message, {
                              colors: true,
                              showHidden: false,
                              breakLength: 80,
                          }),
                )
                .join(tab)
                .split("\n")
                .join(`\n${prefix}`)}`,
        );
    } else {
        compatibilityLevels[info.level].console(prefix, ...info.message);
    }
}
