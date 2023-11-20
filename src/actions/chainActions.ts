/* eslint-disable max-classes-per-file */
import { Logger } from "../logger";

export type ExecutorFunction = (
    ...previousFunctionResults: any[]
) => Promise<any>;

export type RollbackFunction = (options: {
    previousFunctionResults: any[];
    currentFunctionResult: any[];
}) => Promise<any>;

export type StoredActionStep = {
    executor: {
        call: ExecutorFunction;
    };
    rollback: {
        call: RollbackFunction;
    } | null;
    options: Required<StepOptions>;
};

export type StepOptions = {
    abortOnFail?: boolean;
    name?: string;
};

export type ChainActionParams = {
    logger?: Logger | false;
    // @description: Name of this chain
    chainName?: string;
    // @description: Make chain able to roll back if abort signal will be triggered
    ableRollback?: boolean;
    // @description: This option will be used when step will be ChainAction. If true, then all steps of this ChainAction will be extracted to parent ChainAction
    optimizeSubChainActions?: boolean;
    // @description: This option will mount executor context immediately after step creation. Might be useful for speed up execution. Could not be used with optimizeSubChainActions
    usePreBind?: boolean;
};

export class BindFactory {
    public additionalContext: any = {};

    public executor: ExecutorFunction;

    constructor(executor: ExecutorFunction, additionalContext?: any) {
        this.additionalContext = additionalContext;
        this.executor = executor;

        return this.emulateFunction();
    }

    emulateFunction(): BindFactory {
        return Object.assign(
            async (...params: any[]) =>
                this.executor.bind(this.additionalContext)(...params),
            {
                ...this,
                bind: this.bind,
                emulateFunction: this.emulateFunction,
            }
        );
    }

    bind(context: any) {
        this.additionalContext = { ...this.additionalContext, ...context };
        return this.emulateFunction();
    }
}

export type ExecutorBindFunction = (
    executor: ExecutorFunction,
    additionalContext?: any
) => BindFactory;

export type RollbackBindFunction = (
    rollback: RollbackFunction,
    additionalContext?: any
) => BindFactory;

export type StepFactoryFunction = (options: {
    executorBind: ExecutorBindFunction;
    rollbackBind: RollbackBindFunction;
}) => {
    executor: ExecutorFunction;
    rollback?: RollbackFunction;
    options?: StepOptions;
};
export default class ChainAction {
    private actions: StoredActionStep[];

    public __chainActions: boolean = true;

    private options: Omit<Required<ChainActionParams>, "logger"> & {
        logger: Logger;
    };

    private logger: Logger;

    constructor(options?: ChainActionParams) {
        this.options = {
            logger: options?.logger ? options.logger : new Logger(),
            chainName: options?.chainName ?? "",
            ableRollback: options?.ableRollback ?? true,
            optimizeSubChainActions: options?.optimizeSubChainActions ?? true,
            usePreBind: options?.usePreBind ?? false,
        };

        this.logger = this.options.logger;

        this.actions = [];
    }

    private setExecutorContext(executor: ExecutorFunction): ExecutorFunction {
        return executor.bind({
            __step: {
                logger: this.logger,
                chainName: this.options.chainName,
                abort: this.abort.bind(this),
            },
        });
    }

    private setRollbackContext(rollback: RollbackFunction): RollbackFunction {
        return rollback.bind({
            __step: {
                logger: this.logger,
                chainName: this.options.chainName,
            },
        });
    }

    public step(
        executor: ExecutorFunction,
        rollback?: RollbackFunction,
        options?: StepOptions
    ): ChainAction {
        this.actions.push({
            executor: {
                call: this.setExecutorContext(executor),
            },
            rollback: rollback
                ? {
                      call: this.setRollbackContext(rollback),
                  }
                : null,
            options: {
                abortOnFail: options?.abortOnFail ?? true,
                name: options?.name ?? "",
            },
        });

        return Object.assign(
            async (...params: any[]) => this.execute.bind(this)(...params),
            this
        );
    }

    public stepFactory(factory: StepFactoryFunction): ChainAction {
        const { executor, rollback, options } = factory({
            executorBind: (executorFunction, additionalContext) =>
                new BindFactory(executorFunction, additionalContext),
            rollbackBind: (rollbackFunction, additionalContext) =>
                new BindFactory(rollbackFunction, additionalContext),
        });
        return this.step(executor, rollback, options);
    }

    public upgradeLogger(logger: Logger): ChainAction {
        this.logger = logger.child({ name: this.options.chainName });
        return this;
    }

    // public turnToSubChain(): ChainAction {}

    // eslint-disable-next-line class-methods-use-this,@typescript-eslint/no-unused-vars
    execute(...params: any[]) {}

    // eslint-disable-next-line class-methods-use-this
    private abort() {}
}
