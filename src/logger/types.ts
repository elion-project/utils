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

export type LoggerMessage = {
    level: LoggerLevels;
    message: any[];
    meta: {
        level: string[];
        [x: string]: any;
    };
};
