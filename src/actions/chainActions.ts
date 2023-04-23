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

export default class ChainActions {
    private actions: {
        executor: ExecutorFunction;
        rollback?: RollbackFunction;
        options: StepOptions;
    }[];

    public __chainActions: boolean = true;

    constructor(options?: {}) {
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
