import {
    generateTrackIdentifier,
    JSONLike,
    ModelId,
    UpdateStrategy,
} from "../types";

export type ModelEventPublisherConfig = {
    modelName: string;
    send(header: string, payload: JSONLike): void;
};
export class ModelEventPublisher {
    private config: ModelEventPublisherConfig;

    private readonly modelName: string;

    constructor(config: ModelEventPublisherConfig) {
        this.config = config;
        this.modelName = this.config.modelName;
    }

    private generateHeader = (action: string): string =>
        generateTrackIdentifier(this.modelName, action);

    create(id: ModelId, data?: JSONLike): void {
        this.config.send(this.generateHeader("create"), { id, data });
    }

    update(
        id: ModelId,
        data?: JSONLike,
        updateStrategy?: UpdateStrategy
    ): void {
        this.config.send(this.generateHeader("update"), {
            id,
            data,
            updateStrategy,
        });
    }

    delete(id: ModelId): void {
        this.config.send(this.generateHeader("delete"), { id });
    }
}
