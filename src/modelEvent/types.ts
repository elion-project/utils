import { JSONLike } from "../types";

export enum ModelEventAction {
    CREATE = "create",
    UPDATE = "update",
    DELETE = "delete",
}

export type UpdateStrategy = "replace" | "merge";

export const generateTrackIdentifier = (
    modelName: string,
    action: string
): string => `${modelName}:${action}`;

export const getActionFromTrackIdentifier = (trackIdentifier: string): string =>
    trackIdentifier.split(":")[1];
export const getModelNameFromTrackIdentifier = (
    trackIdentifier: string
): string => trackIdentifier.split(":")[0];

export type ModelId = string | number;

export type ModelPrototype = {
    [key: string]: JSONLike;
};

export type ModelSubscribeEvent = {
    modelName: string;
    idParamName: string;
    action: "update" | "delete" | "meta";
    data: {
        id: ModelId;
        data?: JSONLike;
        [key: string]: JSONLike;
    };
};

export type ModelSubscribeUpdateEvent = ModelSubscribeEvent & {
    action: "update";
    data: {
        id: ModelId;
        data: JSONLike;
        updateStrategy: UpdateStrategy;
        index: number;
    };
};

export type ModelSubscribeDeleteEvent = ModelSubscribeEvent & {
    action: "delete";
    data: {
        id: ModelId;
    };
};

export type ModelSubscribeMetaEvent = ModelSubscribeEvent & {
    action: "meta";
    data: {
        id: string;
        data: JSONLike;
    };
};

export type ModelSubscribeEventLike =
    | ModelSubscribeUpdateEvent
    | ModelSubscribeDeleteEvent
    | ModelSubscribeMetaEvent;

export type ModelPublishEvent = {
    id: ModelId;
};

export type ModelPublishUpdateEvent = ModelPublishEvent & {
    data?: JSONLike;
    updateStrategy?: UpdateStrategy;
};

export type ModelPublishDeleteEvent = ModelPublishEvent;

export type ModelPublishEventLike =
    | ModelPublishUpdateEvent
    | ModelPublishDeleteEvent;

export type ModelPublishEventLikeWithHeader = {
    header: string;
    body: ModelPublishEventLike;
};

export enum ModelSubscribeEventBatchSize {
    "default" = 1,
    "auto" = "auto",
}

export enum ModelSubscribeEventQueWaitTime {
    "default" = 100,
}

export enum ModelSubscribeEventKeepAlivePeriod {
    "default" = 5000,
}
export enum ModelSubscribeEventKeepAliveCheckPendingPeriod {
    "default" = 5000,
}

export type ModelSubscribeEventMetaField = {
    [key: string]: {
        triggers: (ModelEventAction | string)[];
        onChange: () => Promise<JSONLike>;
    };
};

export type ModelEventMeta = {
    [key: string]: JSONLike;
};
