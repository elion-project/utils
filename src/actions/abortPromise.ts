/* eslint-disable max-classes-per-file */

export type AbortPromiseConstructorExecutor = (
    resolve: (value: any | PromiseLike<any>) => void,
    reject: (reason?: any) => void,
    abortSignal: AbortSignal,
) => void;
export type AbortPromiseConstructor = [
    executor: AbortPromiseConstructorExecutor,
    abortController?: AbortController,
];
export class AbortPromise {
    constructor(
        executor: AbortPromiseConstructor[0],
        abortController?: AbortPromiseConstructor[1],
    ) {
        const abort = abortController || new AbortController();
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-shadow
        class AbortPromise extends Promise {
            constructor(
                func: (
                    resolve: (value: any | PromiseLike<any>) => void,
                    reject: (reason?: any) => void,
                    abortSignal: AbortSignal,
                ) => void,
            ) {
                super(
                    (
                        resolve: (value: any | PromiseLike<any>) => void,
                        reject: (reason?: any) => void,
                    ) => func(resolve, reject, abort.signal),
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

export interface IAbortPromise {
    new (
        executor: AbortPromiseConstructor[0],
        abortController?: AbortPromiseConstructor[1],
    ): AbortPromise;
}
