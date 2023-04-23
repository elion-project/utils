// eslint-disable-next-line max-classes-per-file
import { Logger } from "../utils/logger.util";

export type ExecutorFunction = (
    ...previousFunctionResults: any[]
) => Promise<any>;

export type RollbackFunction = (options: {
    previousFunctionResults: any[];
    currentFunctionResult: any[];
}) => Promise<any>;

export type StepOptions = {
    abortOnFail?: boolean;
    name?: string;
};

export class AbortPromise {
    constructor(
        executor: (
            resolve: (value: any | PromiseLike<any>) => void,
            reject: (reason?: any) => void,
            abortSignal: AbortSignal
        ) => void,
        abortController?: AbortController
    ) {
        const abort = abortController || new AbortController();
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-shadow
        class AbortPromise extends Promise {
            constructor(
                func: (
                    resolve: (value: any | PromiseLike<any>) => void,
                    reject: (reason?: any) => void,
                    abortSignal: AbortSignal
                ) => void
            ) {
                super(
                    (
                        resolve: (value: any | PromiseLike<any>) => void,
                        reject: (reason?: any) => void
                    ) => func(resolve, reject, abort.signal)
                );
            }

            // eslint-disable-next-line class-methods-use-this
            abort() {
                abort.abort();
            }

            // eslint-disable-next-line class-methods-use-this
            get abortController() {
                return abort;
            }
        }

        return new AbortPromise(executor);
    }
}

export default class ChainActions {
    private actions: {
        executor: ExecutorFunction;
        rollback?: RollbackFunction;
        options: StepOptions;
    }[];

    public __chainActions: boolean;

    constructor(options?: { logger: Logger }) {
        this.__chainActions = true;
        this.actions = [];
    }

    step(
        executor: ExecutorFunction,
        rollback?: RollbackFunction,
        options?: StepOptions
    ): ChainActions {
        this.actions.push({
            executor,
            ...(rollback ? { rollback } : {}),
            options: {
                abortOnFail: options?.abortOnFail ?? true,
                name: options?.name ?? "",
            },
        });

        return Object.assign(
            async (...params: any[]) => this.execute(...params),
            this
        );
    }

    execute(...params: any[]) {}

    abort() {}
}
