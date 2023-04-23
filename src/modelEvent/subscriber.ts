import merge from "lodash.merge";
import {
    generateTrackIdentifier,
    getActionFromTrackIdentifier,
    ModelEventAction,
    ModelId,
    ModelPrototype,
    ModelPublishEventLike,
    ModelPublishEventLikeWithHeader,
    ModelPublishUpdateEvent,
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
    ModelSubscribeUpdateEvent,
} from "./types";

type IdList = ModelId[];

export type SubscribeConfig = {
    trackModelName: string;
    idParamName: string;
    getAll: () => Promise<ModelPrototype[]>;
    getAllIds: () => Promise<IdList>;
    getById: (id: ModelId) => Promise<ModelPrototype>;
    sanitizeModel: (body: ModelPrototype) => Promise<ModelPrototype>;
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

    private modelState = new Map<ModelId, ModelPrototype>();

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

        const getAllResponse = await this.config.getAll();

        getAllResponse.forEach((item) => {
            const id = (item as any)[this.config.idParamName];
            this.modelState.set(id, item);
        });

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
            this.generateTrackIdentifier("update"),
            this.generateTrackIdentifier("delete"),
        ];
        this.trackIdentifiers.forEach((trackIdentifier) =>
            this.config.track(trackIdentifier, this.onTrackEvent.bind(this))
        );

        this.pushToSendQueue(
            ...[
                ...getAllResponse.map((item, index) => {
                    const id: ModelId = (item as any)[this.config.idParamName];
                    const createEvent: ModelSubscribeUpdateEvent = {
                        modelName: this.config.trackModelName,
                        idParamName: this.config.idParamName,
                        action: "update",
                        data: {
                            id,
                            data: item,
                            index,
                            updateStrategy: "replace",
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
        return Array.from(this.modelState.keys());
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
                actions: {
                    name: string;
                    index: number;
                }[];
            }[]
        )
            .filter((item) => item.actions.length > 1)
            .forEach((item) => {
                if (
                    item.actions
                        .map((action) => action.name)
                        .every((name) => name === "update")
                ) {
                    item.actions.slice(0, -1).forEach((action) => {
                        this.queue.splice(action.index, 1);
                    });
                    const updateItem = item.actions.slice(-1)[0];
                    if (
                        (
                            this.queue[updateItem.index]
                                .body as ModelPublishUpdateEvent
                        ).updateStrategy === "merge"
                    ) {
                        //     could cause issues if previous update was merge also
                        //     remove data and change updateStrategy to replace for right now
                        (
                            this.queue[updateItem.index]
                                .body as ModelPublishUpdateEvent
                        ).data = undefined;
                        (
                            this.queue[updateItem.index]
                                .body as ModelPublishUpdateEvent
                        ).updateStrategy = "replace";
                    }
                } else if (
                    item.actions.some((action) => action.name === "delete")
                ) {
                    const currentDeleteIndex = item.actions
                        .reverse()
                        .findIndex((action) => action.name === "delete");
                    if (
                        item.actions.some((action) => action.name === "update")
                    ) {
                        const currentUpdateIndex = item.actions
                            .reverse()
                            .findIndex((action) => action.name === "update");
                        if (currentUpdateIndex < currentDeleteIndex) {
                            // since delete is last, we can just remove all besides delete
                            item.actions.splice(currentDeleteIndex, 1);
                            item.actions.forEach((action) => {
                                this.queue.splice(action.index, 1);
                            });
                        } else {
                            // since update is last, we can just remove all besides update
                            const updateItem = item.actions.splice(
                                currentUpdateIndex,
                                1
                            );
                            item.actions.forEach((action) => {
                                this.queue.splice(action.index, 1);
                            });
                            if (
                                (
                                    this.queue[updateItem[0].index]
                                        .body as ModelPublishUpdateEvent
                                ).updateStrategy === "merge"
                            ) {
                                //     could cause issues if previous update was merge also
                                //     remove data and change updateStrategy to replace for right now
                                (
                                    this.queue[updateItem[0].index]
                                        .body as ModelPublishUpdateEvent
                                ).data = undefined;
                                (
                                    this.queue[updateItem[0].index]
                                        .body as ModelPublishUpdateEvent
                                ).updateStrategy = "replace";
                            }
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
            case "update":
                return this.onUpdate(
                    id,
                    event.body as ModelPublishUpdateEvent,
                    newIdList
                );
            case "delete":
                return { shouldUpdateIndexes: true };
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

    private async findIndexDiff(existedNewIdList?: ModelId[]): Promise<void> {
        const currentIdList = this.getStateIdList();
        const newIdList = existedNewIdList || (await this.config.getAllIds());

        this.pushToSendQueue(
            ...[
                ...currentIdList
                    .filter((id) => !newIdList.includes(id))
                    .map((id) => {
                        this.modelState.delete(id);
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
                        .map(async (id) => {
                            const data = await this.config.getById(id);
                            this.modelState.set(id, data);
                            const index = newIdList.indexOf(id);
                            const createEvent: ModelSubscribeUpdateEvent = {
                                modelName: this.config.trackModelName,
                                idParamName: this.config.idParamName,
                                action: "update",
                                data: {
                                    id,
                                    data,
                                    index,
                                    updateStrategy: "replace",
                                },
                            };
                            return createEvent;
                        })
                )),
            ]
        );
    }

    private async onUpdate(
        id: ModelId,
        body: ModelPublishUpdateEvent,
        existedNewIdList?: IdList
    ): Promise<ModelSubscribeEventPerformerResponse> {
        const newIdList = existedNewIdList || (await this.config.getAllIds());
        const modelHasLocal = this.modelState.has(id);
        const indexInNew = newIdList.indexOf(id);

        const updateStrategy = body.updateStrategy || "replace";
        const data: ModelPrototype =
            (body.data as ModelPrototype) || (await this.config.getById(id));
        const dataFromBody = !!(body.data as ModelPrototype);

        if (indexInNew !== -1) {
            if (updateStrategy === "replace") {
                this.modelState.set(
                    id,
                    dataFromBody ? await this.config.sanitizeModel(data) : data
                );
            } else if (
                updateStrategy === "merge" &&
                body.data &&
                modelHasLocal
            ) {
                this.modelState.set(
                    id,
                    await this.config.sanitizeModel(
                        merge(this.modelState.get(id), data)
                    )
                );
            }
            this.pushToSendQueue({
                modelName: this.config.trackModelName,
                idParamName: this.config.idParamName,
                action: "update",
                data: {
                    id,
                    data: this.modelState.get(id),
                    index: indexInNew,
                    updateStrategy: "replace",
                },
            });
            return { shouldUpdateIndexes: true, newIdList };
        }
        if (modelHasLocal) {
            return { shouldUpdateIndexes: true, newIdList };
        }
        return { shouldUpdateIndexes: false, newIdList };
    }

    public async regenerateState(): Promise<void> {
        await this.unsubscribe();
        const currentIdList = this.getStateIdList();
        this.modelState.clear();
        this.pushToSendQueue(
            ...currentIdList.map((id) => {
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
