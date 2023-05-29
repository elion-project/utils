import { generateTrackIdentifier, ModelId, UpdateStrategyType } from "./types";
import { JSONLike } from "../types";

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

    public create(id: ModelId, data?: JSONLike): void {
        this.config.send(this.generateHeader("update"), {
            id,
            data,
            updateStrategy: "replace",
        });
    }

    public update(
        id: ModelId,
        data?: JSONLike,
        updateStrategy?: UpdateStrategyType
    ): void {
        this.config.send(this.generateHeader("update"), {
            id,
            data,
            updateStrategy: updateStrategy || "merge",
        });
    }

    delete(id: ModelId): void {
        this.config.send(this.generateHeader("delete"), { id });
    }

    public custom(eventName: string, data?: JSONLike) {
        this.config.send(this.generateHeader(eventName), data ?? {});
    }
}
