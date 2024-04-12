// @ts-nocheck
import * as esprima from "esprima";
import * as estraverse from "estraverse";
import { Syntax } from "estraverse";
import * as ESTree from "estree";

//  全局变量下的扩展
export function flatStatement(
    blockNode: ESTree.Node,
    parent: null | ESTree.Node
) {
    if (!Array.isArray(blockNode.body)) {
        return blockNode;
    }

    const treeNodeSubName = {
        [Syntax.BlockStatement]: {
            subsetType: Syntax.VariableDeclarator,
            propertyPath: "body",
        },
        [Syntax.VariableDeclaration]: {
            subsetType: Syntax.VariableDeclarator,
            propertyPath: "declarations",
            thisPrototype: [],
            returnFunc: Array.prototype.concat,
        },
        [Syntax.ExpressionStatement]: {
            subsetType: Syntax.AssignmentExpression,
            propertyPath: "expression.expressions",
        },
        //  返回值的类型不同，无法分开
        // [Syntax.ReturnStatement]: {
        //     subsetType: Syntax.AssignmentExpression,
        //     propertyPath: "argument.expressions",
        // },
    };

    if (
        blockNode.body.filter((item) => treeNodeSubName[item.type]).length <= 0
    ) {
        return blockNode;
    }

    const indexMap = {};
    for (let itemIndex in blockNode.body) {
        const item = blockNode.body[itemIndex];
        if (!treeNodeSubName[item.type]) {
            continue;
        }

        const { propertyPath, subsetType, thisPrototype, returnFunc } =
            treeNodeSubName[item.type];

        const subPath = propertyPath.split(".");
        let subList: any;
        let firstProperty = subPath[0];
        let propertyName = "";
        subPath.map((pathProperty) => {
            subList = subList ? subList[pathProperty] : item[pathProperty];

            propertyName = pathProperty;
        });

        if (
            !Array.isArray(subList) ||
            subList.filter((item) => item.type === subsetType).length <= 1
        ) {
            continue;
        }

        if (!indexMap[itemIndex]) {
            indexMap[itemIndex] = [];
        }

        for (let varItem of subList) {
            const copyNode = structuredClone(item);
            copyNode[firstProperty] = returnFunc
                ? returnFunc.call(thisPrototype, varItem)
                : varItem;
            indexMap[itemIndex].push(copyNode);
        }
    }

    if (Object.keys(indexMap).length > 0) {
        console.log("扩展");
        for (let index in indexMap) {
            blockNode.body.splice(index, 1, indexMap[index]);
        }

        blockNode.body = blockNode.body.flat();
    }

    return blockNode;
}

//  替换对象
export function replaceContion(
    blockNode: ESTree.Node,
    parent: null | ESTree.Node
) {
    if (!Array.isArray(blockNode.body)) {
        return blockNode;
    }

    if (
        blockNode.body.filter(
            (item) =>
                item.type === Syntax.ExpressionStatement &&
                item.expression &&
                item.expression.type === Syntax.ConditionalExpression
        ).length <= 0
    ) {
        return blockNode;
    }

    for (let itemIndex in blockNode.body) {
        let itemNode = blockNode.body[itemIndex];
        if (itemNode.type !== Syntax.ExpressionStatement) {
            continue;
        }
        if (itemNode.expression.type !== Syntax.ConditionalExpression) {
            continue;
        }

        console.log("替换");

        let newNode = {
            type: Syntax.IfStatement,
            alternate: {
                type: Syntax.BlockStatement,
                body: [
                    {
                        type: Syntax.ExpressionStatement,
                        expression: itemNode.expression.alternate,
                    },
                ],
            },
            consequent: {
                type: Syntax.BlockStatement,
                body: [
                    {
                        type: Syntax.ExpressionStatement,
                        expression: itemNode.expression.consequent,
                    },
                ],
            },
            test: itemNode.expression.test,
        };
        blockNode.body.splice(itemIndex, 1, newNode);
    }

    return blockNode;
}

//  代码块补充
export function ifBlockSupplement(
    blockNode: ESTree.Node,
    parent: null | ESTree.Node
) {
    if (!Array.isArray(blockNode.body)) {
        return blockNode;
    }

    for (let itemIndex in blockNode.body) {
        const item = blockNode.body[itemIndex];
        if (!item) {
            debugger;
        }

        // if (item.type === Syntax.IfStatement) {
        //     debugger;
        // }
        //  if条件补充大括号
        if (item.type === Syntax.IfStatement) {
            if (item.consequent.type !== Syntax.BlockStatement) {
                let consequentNode = {
                    type: Syntax.BlockStatement,
                    body: [item.consequent],
                };
                item.consequent = consequentNode;
            }
            if (
                item.alternate &&
                item.alternate.type !== Syntax.BlockStatement
            ) {
                let alternateNode = {
                    type: Syntax.BlockStatement,
                    body: [item.alternate],
                };

                item.alternate = alternateNode;
            }
        }

        if (item.type === Syntax.ForStatement) {
            if (item.body.type !== Syntax.BlockStatement) {
                const node = {
                    type: Syntax.BlockStatement,
                    body: [item.body],
                };
                item.body = node;
            }
        }
    }
    return blockNode;
}

//  替换void
export function replaceVoid(
    blockNode: ESTree.Node,
    parent: null | ESTree.Node
) {
    if (blockNode.type !== Syntax.UnaryExpression) {
        return blockNode;
    }

    if (
        blockNode.operator !== "void" &&
        blockNode.argument.type !== Syntax.Literal
    ) {
        return blockNode;
    }

    if (blockNode.argument.value !== 0) {
        return blockNode;
    }

    const newNode = {
        type: Syntax.Identifier,
        name: "undefined",
    };

    return newNode;
}

export function watchChange(watchTarget, targetName) {
    if (typeof watchTarget !== "object" || watchTarget === null) {
        return watchTarget;
    }
    function envResult(codeLine = 62) {
        let now_name = "";
        if (globalThis.process) {
            const file_path = process.argv[1];
            const file_paths = file_path.split("\\");
            now_name = file_paths[file_paths.length - 1];
        }

        const err = new Error();
        let stacks = err.stack.split("\n");
        stacks = stacks
            .filter((item) => item.includes(now_name))
            .filter((stackItem) => {
                const res = /^.*[\\/](.*?):(\d+):(\d*)/.exec(stackItem);
                if (!res) {
                    return false;
                }
                const [source, filename, line, lineIndex] = res;
                if (parseInt(line, 10) <= codeLine) {
                    return false;
                }
                return true;
            });
        const val = stacks[0];
        const res = /^.*[\\/](.*?):(\d+):(\d*)/.exec(val);
        if (!res) {
            throw Error("捕获错误");
        }
        const [source, filename, line, lineIndex] = res;

        return {
            source,
            filename,
            line: Number(line),
            lineIndex: Number(lineIndex),
            stacks,
        };
    }
    const proxyTarget = new Proxy(watchTarget, {
        get(target, prop, receiver) {
            const result = envResult();
            let jStr = target;
            try {
                jStr = JSON.stringify(target, function (key, value) {
                    if (value == window) {
                        return undefined;
                    }
                    return value;
                });
            } catch (error) {}
            console.log(
                `${targetName}:${result.line}行${result.lineIndex}:调用`,
                jStr,
                prop
            );
            const res = Reflect.get(target, prop, receiver);
            console.log(
                `${targetName}:${result.line}行${result.lineIndex}:返回`,
                res
            );
            return res;
        },
        set(target, prop, value, receiver) {
            const result = envResult();
            let jStr = target;
            try {
                jStr = JSON.stringify(target, function (key, value) {
                    if (value == window) {
                        return undefined;
                    }
                    return value;
                });
            } catch (error) {}
            console.log(
                `${targetName}参数:${result.line}行${result.lineIndex}:设置`,
                jStr,
                prop,
                "值",
                value
            );
            const success = Reflect.set(target, prop, value, receiver);
            return success;
        },
    });

    return proxyTarget;
}