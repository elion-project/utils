import {
    JSONLike,
    ModelSubscribeCreateEvent,
    ModelSubscribeDeleteEvent,
    ModelSubscribeEvent,
    ModelEventMeta,
    ModelSubscribeMetaEvent,
    ModelSubscribeUpdateEvent,
    ModelSubscribeEventLike,
    ModelId,
} from "../types";

export type ModelEventConstructorConfig = {
    onUpdate?(state: {
        models: JSONLike[];
        metadataState: ModelEventMeta;
    }): void | Promise<void>;
    onMetaUpdate?(metadataState: ModelEventMeta): void | Promise<void>;
    onModelUpdate?(models: JSONLike[]): void | Promise<void>;
};

export class ModelEventConstructor {
    private config: Required<ModelEventConstructorConfig>;

    private modelState: Map<ModelId, JSONLike> = new Map();

    private modelIndexMap: ModelId[] = [];

    private metaState: Map<string, JSONLike> = new Map();

    private metadataState: ModelEventMeta = {};

    constructor(config: ModelEventConstructorConfig) {
        this.config = {
            onUpdate: config.onUpdate || (() => {}),
            onMetaUpdate: config.onMetaUpdate || (() => {}),
            onModelUpdate: config.onModelUpdate || (() => {}),
        };
    }

    public onEvent(events: ModelSubscribeEventLike[]): void {
        let updateMetadata = false;
        let updateModels = false;
        events.forEach((event) => {
            switch (event.action) {
                case "create":
                    this.onCreate.bind(this)(
                        event as ModelSubscribeCreateEvent
                    );
                    updateModels = true;
                    break;
                case "update":
                    this.onUpdate.bind(this)(
                        event as ModelSubscribeUpdateEvent
                    );
                    updateModels = true;
                    break;
                case "delete":
                    this.onDelete.bind(this)(
                        event as ModelSubscribeDeleteEvent
                    );
                    updateModels = true;
                    break;
                case "meta":
                    updateMetadata = true;
                    this.onMeta.bind(this)(event as ModelSubscribeMetaEvent);
                    break;
                default:
                    throw new Error(
                        `Unknown action "${
                            (event as ModelSubscribeEvent).action
                        }"`
                    );
            }
        });
        if (updateMetadata || updateModels) {
            this.updateInnerState.bind(this)();
        }
        if (updateModels) {
            this.updateModelsState.bind(this)();
        }
        if (updateMetadata) {
            this.updateMetadataState.bind(this)();
        }
    }

    private onCreate(event: ModelSubscribeCreateEvent): void {
        const insertIndex = event.data.index;
        const { data, id } = event.data;
        this.modelState.set(id, data);
        this.modelIndexMap.splice(insertIndex, 0, id);
    }

    private onUpdate(event: ModelSubscribeUpdateEvent): void {
        const { data, index, id } = event.data;
        this.modelState.set(id, data);
        const oldIndex = this.modelIndexMap.findIndex(
            (itemId) => itemId === id
        );
        if (oldIndex !== -1) {
            this.modelIndexMap.splice(oldIndex, 1);
            this.modelIndexMap.splice(index, 0, id);
        } else {
            this.modelIndexMap.splice(index, 0, id);
        }
    }

    private onDelete(event: ModelSubscribeDeleteEvent): void {
        const { id } = event.data;
        this.modelState.delete(id);
        const index = this.modelIndexMap.findIndex((itemId) => itemId === id);
        if (index !== -1) {
            this.modelIndexMap.splice(index, 1);
        }
    }

    private onMeta(event: ModelSubscribeMetaEvent): void {
        const { data, id } = event.data;
        this.metadataState[id] = data;
    }

    private updateInnerState(): void {
        this.config.onUpdate({
            models: this.modelIndexMap.map((id) => this.modelState.get(id)),
            metadataState: this.metadataState,
        });
    }

    private updateMetadataState(): void {
        this.config.onMetaUpdate(this.metadataState);
    }

    private updateModelsState(): void {
        this.config.onModelUpdate(
            this.modelIndexMap.map((id) => this.modelState.get(id))
        );
    }
}
