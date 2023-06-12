import { JSONLike } from "../types";

export enum ModelEventAction {
    UPDATE = "update",
    DELETE = "delete",
    META = "meta",
}

export type UpdateStrategyType = UpdateStrategy;

export enum UpdateStrategy {
    REPLACE = "replace",
    MERGE = "merge",
}

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
    action: "update" | "delete" | "meta" | ModelEventAction | string;
    data: {
        id: ModelId;
        data?: JSONLike;
        [key: string]: JSONLike;
    };
};

export type ModelSubscribeUpdateEvent = ModelSubscribeEvent & {
    action: ModelEventAction.UPDATE;
    data: {
        id: ModelId;
        data: JSONLike;
        updateStrategy: UpdateStrategyType;
        index: number;
    };
};

export type ModelSubscribeDeleteEvent = ModelSubscribeEvent & {
    action: ModelEventAction.DELETE;
    data: {
        id: ModelId;
    };
};

export type ModelSubscribeMetaEvent = ModelSubscribeEvent & {
    action: ModelEventAction.META;
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
    updateStrategy?: UpdateStrategyType;
};

export type ModelPublishDeleteEvent = ModelPublishEvent;

export type ModelPublishCustomEvent = ModelPublishEvent & {
    data?: JSONLike;
};

export type ModelPublishEventLike =
    | ModelPublishUpdateEvent
    | ModelPublishDeleteEvent
    | ModelPublishCustomEvent;

export type ModelPublishEventLikeWithHeader = {
    header: string;
    body: ModelPublishEventLike;
};

export enum ModelSubscribeEventBatchSize {
    "default" = 1,
    "auto" = "auto",
}

export enum ModelSubscriberEventFirstContentSendSize {
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
        modelTriggers: (ModelEventAction | string)[];
        customTriggers?: string[];
        onModelChange: () => Promise<JSONLike>;
        onCustomTrigger?: (
            eventName: string,
            eventData: JSONLike
        ) => Promise<JSONLike>;
    };
};

export type ModelEventMeta = {
    [key: string]: JSONLike;
};

export type IdList = ModelId[];
