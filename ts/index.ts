import StorageManager, { StorageRegistry, isChildOfRelationship, getChildOfRelationshipTarget } from '@worldbrain/storex'
import { CollectionDefinition } from '@worldbrain/storex/lib/types/collections'
import { renderOperationArgs } from './operations';

export class StorageModuleRegistry<Modules = {[name : string] : StorageModule}> {
    modules : Modules = {} as any

    register<Module>(name : keyof Modules, module : Module) {
        this.modules[name as string] = module
    }
}

type CreateObjectDefinition = {operation: 'createObject', collection : string}
type MiscOperationDefinition = {operation : string, collection? : string, args: {[key : string]: any}}
export type StorageOperationDefinition = MiscOperationDefinition | CreateObjectDefinition
export type StorageOperationDefinitions = {[name : string] : StorageOperationDefinition}

type StorageOperationExecuter = ({name, context, method, render} : {name : string, context, method : string, render : () => any}) => Promise<any>
export type StorageModuleCollections = {[name : string] : CollectionDefinition & {history?: Array<CollectionDefinition>}}
export type StorageModuleConfig = {collections : StorageModuleCollections, operations : StorageOperationDefinitions}
export type StorageModuleConstructorArgs = {storageManager : StorageManager, operationExecuter? : StorageOperationExecuter}

export abstract class StorageModule {
    // private _storageManager : StorageManager
    private _operationExecuter? : StorageOperationExecuter
    private _config : StorageModuleConfig

    constructor({storageManager, operationExecuter} : StorageModuleConstructorArgs) {
        // this._storageManager = storageManager
        this._operationExecuter = operationExecuter || _defaultOperationExecutor(storageManager)
    }

    private _initConfig() {
        if (!this._config) {
            this._config = this.getConfig()
            _autoGenerateOperations(this)
        }
    }

    abstract getConfig() : StorageModuleConfig

    get collections() {
        this._initConfig()
        return this._config.collections
    }

    get operations() {
        this._initConfig()
        return this._config.operations
    }
    
    protected async operation(name : string, context : {[key : string] : any}, _method? : string) {
        if (this._operationExecuter) {
            return this._operationExecuter({name, context, method: _method, render: () => {
                return _renderOperation(this.operations[name], context)
            }})
        }
    }
}

export function registerModuleRegistryCollections<Modules>(collectionRegistry : StorageRegistry, moduleRegistry : StorageModuleRegistry<Modules>) {
    for (const storageModule of Object.values(moduleRegistry.modules)) {
        registerModuleCollections(collectionRegistry, storageModule)
    }
}

export function registerModuleCollections(collectionRegistry : StorageRegistry, storageModule : StorageModule) {
    for (const [collectionName, collectionDefinition] of Object.entries(storageModule.collections)) {
        collectionRegistry.registerCollection(collectionName, collectionDefinition as CollectionDefinition)
    }
}

export function _defaultOperationExecutor(storageManager : StorageManager, debug = false) {
    return async ({render} : {render : () => any}) => {
        const [operation, ...args] = render()
        if (debug) {
            console.debug('DEBUG - storage backend operation:', operation, args)
        }
        return storageManager.backend.operation(operation, ...args)
    }
}

export function _renderOperation(operation : any, context : any) {
    const args = [operation.operation]
    if (operation.collection) {
        args.push(operation.collection)
    }

    const rendered = renderOperationArgs(operation.args, context)
    if (operation.args instanceof Array) {
        args.push(...rendered)
    } else {
        args.push(rendered)
    }
    return args
}

export function _autoGenerateOperations(storageModule : StorageModule) {
    for (const operationDefinition of Object.values(storageModule.operations)) {
        if (operationDefinition.operation === 'createObject') {
            let collectionDefinition = storageModule.collections[operationDefinition.collection]
            if (collectionDefinition instanceof Array) {
                collectionDefinition = collectionDefinition.slice(-1)[0]
            }

            const args = operationDefinition['args'] = {}
            for (const [fieldName, fieldDefinition] of Object.entries(collectionDefinition.fields)) {
                args[fieldName] = `$${fieldName}:${fieldDefinition.type}`
            }
            for (const relationship of collectionDefinition.relationships || []) {
                if (isChildOfRelationship(relationship)) {
                    const alias = relationship.alias || getChildOfRelationshipTarget(relationship)
                    args[alias] = `$${alias}`
                }
            }
        }
    }
}
