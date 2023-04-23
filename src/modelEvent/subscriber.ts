import {
    generateTrackIdentifier,
    getActionFromTrackIdentifier,
    JSONLike,
    ModelEventAction,
    ModelId,
    ModelPrototype,
    ModelPublishCreateEvent,
    ModelPublishEventLike,
    ModelPublishEventLikeWithHeader,
    ModelPublishUpdateEvent,
    ModelSubscribeCreateEvent,
    ModelSubscribeDeleteEvent,
    ModelSubscribeEvent,
    ModelSubscribeEventBatchSize,
    ModelSubscribeEventKeepAliveCheckPendingPeriod,
    ModelSubscribeEventKeepAlivePeriod,
    ModelSubscribeEventLike,
    ModelEventMeta,
    ModelSubscribeEventMetaField,
    ModelSubscribeEventQueWaitTime,
    ModelSubscribeMetaEvent,
} from "../types";

// TODO: add batch sen
// TODO: add que aggregator
// TODO: add simple fields

type IdList = ModelId[];

export type SubscribeConfig = {
    trackModelName: string;
    idParamName: string;
    getAll: () => Promise<ModelPrototype[]>;
    getAllIds: () => Promise<IdList>;
    getById: (id: ModelId) => Promise<ModelPrototype>;
    track: (
        trackIdentifier: string,
        onTrackEvent: ModelEventSubscriber["onTrackEvent"]
    ) => void;
    removeTrack: (trackIdentifier: string) => Promise<void>;
    onModelEvent: (event: ModelSubscribeEvent[]) => void;
    // @description if batchSize is "auto" then batchSize will be calculated by count of available queue items. If batchSize is number, then que will wait for required count of items and then send them
    batchSize?: number | ModelSubscribeEventBatchSize;
    // @description period of time (in ms) between que checks. 100ms by default
    queWaitTime?: number | ModelSubscribeEventQueWaitTime;
    metaFields?: ModelSubscribeEventMetaField;
    keepAlive: {
        // @description period of time (in ms) between keepAlive requests. 5000ms by default
        period?: number | ModelSubscribeEventKeepAlivePeriod;
        pendingPeriod?: number | ModelSubscribeEventKeepAliveCheckPendingPeriod;
        onKeepAlive: () => Promise<boolean>;
    };
};

type ModelSubscribeEventPerformerResponse = {
    shouldUpdateIndexes: boolean;
    newIdList?: IdList;
};

export class ModelEventSubscriber {
    private config: Required<SubscribeConfig>;

    private queue: ModelPublishEventLikeWithHeader[] = [];

    private sendQueue: ModelSubscribeEventLike[] = [];

    private queueTimeout: NodeJS.Timeout | null = null;

    private keepAliveTimeout: NodeJS.Timeout | null = null;

    private state: JSONLike[] = [];

    private trackIdentifiers: string[] = [];

    constructor(config: SubscribeConfig) {
        this.config = {
            ...config,
            batchSize: config.batchSize || ModelSubscribeEventBatchSize.auto,
            queWaitTime:
                config.queWaitTime || ModelSubscribeEventQueWaitTime.default,
            metaFields: config.metaFields || {},
            keepAlive: {
                period:
                    config.keepAlive.period ||
                    ModelSubscribeEventKeepAlivePeriod.default,
                pendingPeriod:
                    config.keepAlive.pendingPeriod ||
                    ModelSubscribeEventKeepAliveCheckPendingPeriod.default,
                onKeepAlive: config.keepAlive.onKeepAlive,
            },
        };
        this.init();
    }

    private generateTrackIdentifier = (action: string): string =>
        generateTrackIdentifier(this.config.trackModelName, action);

    public async init() {
        this.keepAliveTimeout = setTimeout(
            this.onKeepAliveCheck.bind(this),
            this.config.keepAlive.period
        );

        this.state = await this.config.getAll();

        const metaFields = (
            await Promise.all(
                Object.entries(this.config.metaFields).map(
                    async ([key, item]) => [
                        key as string,
                        await item.onChange(),
                    ]
                )
            )
        ).reduce((acc, [key, value]) => {
            acc[key as string] = value;
            return acc;
        }, {} as ModelEventMeta);
        this.trackIdentifiers = [
            this.generateTrackIdentifier("create"),
            this.generateTrackIdentifier("update"),
            this.generateTrackIdentifier("delete"),
        ];
        this.trackIdentifiers.forEach((trackIdentifier) =>
            this.config.track(trackIdentifier, this.onTrackEvent.bind(this))
        );

        this.pushToSendQueue(
            ...[
                ...this.state.map((item) => {
                    const id: ModelId = (item as any)[this.config.idParamName];
                    const createEvent: ModelSubscribeCreateEvent = {
                        modelName: this.config.trackModelName,
                        idParamName: this.config.idParamName,
                        action: "create",
                        data: {
                            id,
                            data: item,
                            index: this.state.indexOf(item),
                        },
                    };
                    return createEvent;
                }),
                ...Object.entries(metaFields).map(([key, value]) => {
                    const event: ModelSubscribeMetaEvent = {
                        modelName: this.config.trackModelName,
                        idParamName: this.config.idParamName,
                        action: "meta",
                        data: {
                            id: key,
                            data: value,
                        },
                    };
                    return event;
                }),
            ]
        );
    }

    private getStateIdList(): IdList {
        return this.state.map((item) => (item as any)[this.config.idParamName]);
    }

    private pushToQueue(...events: ModelPublishEventLikeWithHeader[]): void {
        if (events.length) {
            const currentQueLength = this.queue.length;
            const currentSendQueLength = this.sendQueue.length;
            this.queue.push(...events);
            if (currentQueLength === 0 && currentSendQueLength === 0) {
                setTimeout(this.onQueueStep.bind(this), 0);
            }
        }
    }

    private pushToSendQueue(...events: ModelSubscribeEventLike[]): void {
        if (events.length) {
            const currentQueLength = this.queue.length;
            const currentSendQueLength = this.sendQueue.length;
            this.sendQueue.push(...events);
            if (currentQueLength === 0 && currentSendQueLength === 0) {
                setTimeout(this.onQueueStep.bind(this), 0);
            }
        }
    }

    private async onKeepAliveCheck(): Promise<void> {
        const isAlive = await Promise.race([
            this.config.keepAlive.onKeepAlive(),
            new Promise((resolve) => {
                setTimeout(() => {
                    resolve(false);
                }, this.config.keepAlive.pendingPeriod);
            }),
        ]);
        if (!isAlive) {
            await this.unsubscribe();
        } else {
            this.keepAliveTimeout = setTimeout(
                this.onKeepAliveCheck.bind(this),
                this.config.keepAlive.period
            );
        }
    }

    private async optimizeQueue(): Promise<void> {
        (
            this.queue.reduce((acc, item, index) => {
                const itemIndex = acc.findIndex((i) => i.id === item.body.id);
                if (itemIndex === -1) {
                    return [
                        ...acc,
                        {
                            id: item.body.id,
                            actions: [
                                {
                                    name: getActionFromTrackIdentifier(
                                        item.header
                                    ),
                                    index,
                                },
                            ],
                        },
                    ];
                }
                acc[itemIndex].actions.push({
                    name: getActionFromTrackIdentifier(item.header),
                    index,
                });
                return acc;
            }, []) as {
                id: ModelId;
                actions: { name: string; index: number }[];
            }[]
        )
            .filter((item) => item.actions.length > 1)
            .forEach((item) => {
                if (
                    item.actions
                        .map((action) => action.name)
                        .every((name) => name === "update")
                ) {
                    // TODO: Keep for now. Should support updateStrategy
                    item.actions.slice(0, -1).forEach((action) => {
                        this.queue.splice(action.index, 1);
                    });
                } else if (
                    item.actions.some((action) => action.name === "delete")
                ) {
                    const currentDeleteIndex = item.actions.findIndex(
                        (action) => action.name === "delete"
                    );
                    if (
                        item.actions.some((action) => action.name === "create")
                    ) {
                        const currentCreateIndex = item.actions.findIndex(
                            (action) => action.name === "create"
                        );
                        if (currentCreateIndex < currentDeleteIndex) {
                            this.queue.splice(
                                item.actions[currentCreateIndex].index,
                                1
                            );
                            this.queue.splice(
                                item.actions[currentDeleteIndex].index,
                                1
                            );
                        } else {
                            //    TODO: Should be converted to update
                            this.queue.splice(
                                item.actions[currentDeleteIndex].index,
                                1
                            );
                        }
                    } else if (
                        item.actions.some((action) => action.name === "update")
                    ) {
                        const currentUpdateIndex = item.actions.findIndex(
                            (action) => action.name === "update"
                        );
                        if (currentUpdateIndex < currentDeleteIndex) {
                            this.queue.splice(
                                item.actions[currentUpdateIndex].index,
                                1
                            );
                        } else {
                            //     Actually, this situation should not happen
                            //     Anyway, remove update action, since delete is more important
                            this.queue.splice(
                                item.actions[currentUpdateIndex].index,
                                1
                            );
                        }
                    }
                } else if (
                    item.actions.some((action) => action.name === "create")
                ) {
                    const currentCreateIndex = item.actions.findIndex(
                        (action) => action.name === "create"
                    );
                    if (
                        item.actions.some((action) => action.name === "update")
                    ) {
                        const currentUpdateIndex = item.actions.findIndex(
                            (action) => action.name === "update"
                        );
                        if (currentUpdateIndex < currentCreateIndex) {
                            //    Actually, this situation should not happen
                            //    Anyway, remove create action, since update is more important
                            this.queue.splice(
                                item.actions[currentCreateIndex].index,
                                1
                            );
                        } else {
                            // TODO: should use create, but data from update
                            // keep update action for now
                            this.queue.splice(
                                item.actions[currentCreateIndex].index,
                                1
                            );
                        }
                    }
                }
            });
    }

    private async optimizeSendQueue(): Promise<void> {
        Object.entries(
            this.sendQueue.reduce((acc, item, index) => {
                if ((acc as any)[item.data.id]) {
                    (acc as any)[item.data.id].push({ event: item, index });
                    return acc;
                }
                return { ...acc, [item.data.id]: [{ event: item, index }] };
            }, {}) as {
                [x: ModelId]: {
                    event: ModelSubscribeEventLike;
                    index: number;
                }[];
            }
        )
            .filter(([, items]) => items.length > 1)
            .forEach(([, items]) => {
                if (
                    items
                        .map((item) => item.event.action)
                        .every((action) => action === "update")
                ) {
                    items.slice(0, -1).forEach((item) => {
                        this.sendQueue.splice(item.index, 1);
                    });
                }
            });
    }

    private async onQueueStep(): Promise<void> {
        if (this.queue.length) {
            let shouldUpdateIndexes = false;
            let newIdList: IdList = null;
            await this.optimizeQueue();
            for (let i = 0; i < this.queue.length; i++) {
                const eventResponse = await this.performQue(
                    this.queue[i],
                    newIdList
                );
                if (eventResponse.shouldUpdateIndexes) {
                    shouldUpdateIndexes = true;
                }
                if (eventResponse.newIdList) {
                    newIdList = eventResponse.newIdList;
                }
            }
            this.queue = [];
            if (shouldUpdateIndexes) {
                await this.findIndexDiff();
            }
            const triggers = this.queue.map((event) =>
                getActionFromTrackIdentifier(event.header)
            );
            this.pushToSendQueue(
                ...(
                    await Promise.all(
                        Object.entries(this.config.metaFields)
                            .filter(([, item]) =>
                                item.triggers.some((trigger) =>
                                    triggers.includes(trigger)
                                )
                            )
                            .map(async ([key, item]) => [
                                key,
                                await item.onChange(),
                            ])
                    )
                ).map(
                    ([key, value]): ModelSubscribeMetaEvent => ({
                        modelName: this.config.trackModelName,
                        idParamName: this.config.idParamName,
                        action: "meta",
                        data: {
                            id: key as string,
                            data: value,
                        },
                    })
                )
            );
        }

        if (this.sendQueue.length) {
            await this.optimizeSendQueue();
            if (this.config.batchSize === ModelSubscribeEventBatchSize.auto) {
                this.config.onModelEvent(this.sendQueue);
                this.sendQueue = [];
            } else {
                const batch = this.sendQueue.splice(0, this.config.batchSize);
                this.config.onModelEvent(batch);
            }
        }

        if (this.queue.length || this.sendQueue.length) {
            this.queueTimeout = setTimeout(
                this.onQueueStep.bind(this),
                this.config.queWaitTime
            );
        }
    }

    private async performQue(
        event: ModelPublishEventLikeWithHeader,
        newIdList?: IdList
    ): Promise<ModelSubscribeEventPerformerResponse> {
        const action = getActionFromTrackIdentifier(event.header);
        const id: ModelId = (event.body as any)[this.config.idParamName];
        switch (action) {
            case "create":
                return this.onCreate(
                    id,
                    event.body as ModelPublishCreateEvent,
                    newIdList
                );
            case "update":
                return this.onUpdate(
                    id,
                    event.body as ModelPublishUpdateEvent,
                    newIdList
                );
            case "delete":
                return this.onDelete(id);
            default:
                throw new Error(`Unknown action "${action}"`);
        }
    }

    private async onTrackEvent(
        header: string,
        body: ModelPublishEventLike
    ): Promise<void> {
        const action = getActionFromTrackIdentifier(header);

        if (
            action !== ModelEventAction.CREATE &&
            action !== ModelEventAction.UPDATE &&
            action !== ModelEventAction.DELETE
        ) {
            throw new Error(`Unknown action "${action}"`);
        } else {
            this.pushToQueue({ header, body });
        }
    }

    private async findIndexDiff(
        existedNewIdList?: ModelId[],
        ignoreId?: ModelId
    ): Promise<void> {
        const currentIdList = this.getStateIdList();
        const newIdList = existedNewIdList || (await this.config.getAllIds());
        const ignoreIdCheck = (id: ModelId) =>
            ignoreId ? id !== ignoreId : true;

        this.pushToSendQueue(
            ...[
                ...currentIdList
                    .filter((id) => !newIdList.includes(id))
                    .filter(ignoreIdCheck)
                    .map((id) => {
                        const index = currentIdList.indexOf(id);
                        this.state.splice(index, 1);
                        const deleteEvent: ModelSubscribeDeleteEvent = {
                            modelName: this.config.trackModelName,
                            idParamName: this.config.idParamName,
                            action: "delete",
                            data: { id },
                        };
                        return deleteEvent;
                    }),
                ...(await Promise.all(
                    newIdList
                        .filter((id) => !currentIdList.includes(id))
                        .filter(ignoreIdCheck)
                        .map(async (id) => {
                            const data = await this.config.getById(id);
                            this.state.push(data);
                            const index = newIdList.indexOf(id);
                            const createEvent: ModelSubscribeCreateEvent = {
                                modelName: this.config.trackModelName,
                                idParamName: this.config.idParamName,
                                action: "create",
                                data: { id, data, index },
                            };
                            return createEvent;
                        })
                )),
            ]
        );
    }

    private async onCreate(
        id: ModelId,
        body: ModelPublishCreateEvent,
        existedNewIdList?: IdList
    ): Promise<ModelSubscribeEventPerformerResponse> {
        const idList = existedNewIdList || (await this.config.getAllIds());
        const index = idList.indexOf(id);
        if (index !== -1) {
            const data = body.data || (await this.config.getById(id));
            this.state.push(data);
            this.pushToSendQueue({
                modelName: this.config.trackModelName,
                idParamName: this.config.idParamName,
                action: "create",
                data: { id, data, index },
            });
            return { shouldUpdateIndexes: true, newIdList: idList };
        }
        return { shouldUpdateIndexes: false, newIdList: idList };
    }

    private async onUpdate(
        id: ModelId,
        body: ModelPublishUpdateEvent,
        existedNewIdList?: IdList
    ): Promise<ModelSubscribeEventPerformerResponse> {
        const currentIdList = this.getStateIdList();
        const newIdList = existedNewIdList || (await this.config.getAllIds());

        const indexInCurrent = currentIdList.indexOf(id);
        const indexInNew = newIdList.indexOf(id);
        if (indexInCurrent !== -1) {
            if (indexInNew === -1) {
                // Can omit of doing that. Will be deleted by index check
                this.state.splice(indexInCurrent, 1);
                this.pushToSendQueue({
                    modelName: this.config.trackModelName,
                    idParamName: this.config.idParamName,
                    action: "delete",
                    data: { id },
                });
                return { shouldUpdateIndexes: true, newIdList };
            }
            const data = body.data || (await this.config.getById(id));
            this.state[indexInCurrent] = data;
            this.pushToSendQueue({
                modelName: this.config.trackModelName,
                idParamName: this.config.idParamName,
                action: "update",
                data: {
                    id,
                    data,
                    updateStrategy: body.updateStrategy,
                    index: indexInNew,
                },
            });
            return { shouldUpdateIndexes: false, newIdList };
        }
        if (indexInNew !== -1) {
            // could be regenerated trough index check
            const data = body.data || (await this.config.getById(id));
            this.state.push(data);
            this.pushToSendQueue({
                modelName: this.config.trackModelName,
                idParamName: this.config.idParamName,
                action: "create",
                data: { id, data, index: indexInNew },
            });
            return { shouldUpdateIndexes: true, newIdList };
        }
        return { shouldUpdateIndexes: false, newIdList };
    }

    private async onDelete(
        id: ModelId
    ): Promise<ModelSubscribeEventPerformerResponse> {
        const currentIdList = this.getStateIdList();

        if (currentIdList.includes(id)) {
            const index = currentIdList.indexOf(id);
            this.state.splice(index, 1);
            this.pushToSendQueue({
                modelName: this.config.trackModelName,
                idParamName: this.config.idParamName,
                action: "delete",
                data: { id },
            });
            return { shouldUpdateIndexes: true };
        }
        return { shouldUpdateIndexes: false };
    }

    public async regenerateState(): Promise<void> {
        await this.unsubscribe();
        const currentIdList = this.getStateIdList();
        this.pushToSendQueue(
            ...currentIdList.map((id) => {
                const index = currentIdList.indexOf(id);
                this.state.splice(index, 1);
                const deleteEvent: ModelSubscribeDeleteEvent = {
                    modelName: this.config.trackModelName,
                    idParamName: this.config.idParamName,
                    action: "delete",
                    data: { id },
                };
                return deleteEvent;
            })
        );
        await this.init();
    }

    public async regenerateIndexes(): Promise<void> {
        await this.findIndexDiff();
    }

    public async unsubscribe(): Promise<void> {
        if (this.keepAliveTimeout) clearTimeout(this.keepAliveTimeout);
        await Promise.all(
            this.trackIdentifiers.map((trackIdentifier) =>
                this.config.removeTrack(trackIdentifier)
            )
        );
    }
}
