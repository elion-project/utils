import {
    ModelSubscribeDeleteEvent,
    ModelSubscribeEvent,
    ModelEventMeta,
    ModelSubscribeMetaEvent,
    ModelSubscribeUpdateEvent,
    ModelSubscribeEventLike,
    ModelId,
} from "./types";
import { JSONLike } from "../types";

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

    private metadataState: Map<string, JSONLike> = new Map();

    private modelIndexMap: ModelId[] = [];

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

    private cleanModelFromIndexList(
        id: ModelId,
        cleanMap: boolean = false
    ): boolean {
        const oldIndexes: number[] = this.modelIndexMap
            .map((item, index) => [item, index])
            .filter(([itemId]) => itemId === id)
            .map(([, index]: [ModelId, number]) => index);
        if (oldIndexes.length) {
            if (cleanMap) {
                this.modelState.delete(id);
            }
            oldIndexes.forEach((index) => {
                this.modelIndexMap.splice(index, 1);
            });
            return true;
        }
        return false;
    }

    private onUpdate(event: ModelSubscribeUpdateEvent): void {
        const { data, index, id, updateStrategy } = event.data;
        if (updateStrategy === "replace") {
            this.modelState.set(id, data);
            this.cleanModelFromIndexList(id);
            this.modelIndexMap.splice(index, 0, id);
        } else {
            console.warn(
                `method ${updateStrategy} is not implemented yet! Skipping...`
            );
        }
    }

    private onDelete(event: ModelSubscribeDeleteEvent): void {
        const { id } = event.data;
        this.modelState.delete(id);
        this.cleanModelFromIndexList(id, true);
    }

    private onMeta(event: ModelSubscribeMetaEvent): void {
        const { data, id } = event.data;
        this.metadataState.set(id, data);
    }

    private updateInnerState(): void {
        this.config.onUpdate({
            models: this.modelIndexMap.map((id) => this.modelState.get(id)),
            metadataState: Object.fromEntries(this.metadataState),
        });
    }

    private updateMetadataState(): void {
        this.config.onMetaUpdate(Object.fromEntries(this.metadataState));
    }

    private updateModelsState(): void {
        this.config.onModelUpdate(
            this.modelIndexMap.map((id) => this.modelState.get(id))
        );
    }
}
