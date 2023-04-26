import { LoggerMessage } from "../types";

export const generateLevelInput = (level: string, size = 5) =>
    `${Array.from({ length: size - level.length }, () => " ").join(
        ""
    )}${level}`;

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
export function consoleLogTransport(info: LoggerMessage): void | Promise<void> {
    compatibilityLevels[info.level](
        `(${new Date().toLocaleString()}) ${generateLevelInput(
            info.level
        )} [${info.meta.level.join(" > ")}]:`,
        ...info.message
    );
}
