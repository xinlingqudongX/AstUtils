// @ts-nocheck
import * as esprima from "esprima";
import * as estraverse from "estraverse";
import { Syntax } from "estraverse";
import * as ESTree from "estree";

const assignmentComment = {
    "<<": "左移",
    ">>": "右移",
    "&": "按位与",
    "|": "按位或",
};
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

    const logIndexMap = {};
    for (let index in blockNode.body) {
        let itemIndex = parseInt(index);
        let itemNode = blockNode.body[itemIndex];
        if (itemNode.type === Syntax.ExpressionStatement) {
            if (itemNode.expression.type === Syntax.ConditionalExpression) {
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

            if (
                itemNode.expression.type === Syntax.SequenceExpression &&
                itemNode.expression.expressions.length > 1 &&
                itemNode.expression.expressions[0].type ===
                    Syntax.LogicalExpression &&
                itemNode.expression.expressions[0].operator === "&&"
            ) {
                let otherConsequent = itemNode.expression.expressions.slice(
                    1,
                    itemNode.expression.expressions.length
                );
                otherConsequent.unshift(
                    itemNode.expression.expressions[0].right
                );
                otherConsequent = otherConsequent.map((item) => {
                    return {
                        type: Syntax.ExpressionStatement,
                        expression: item,
                    };
                });
                let newNode = {
                    type: Syntax.IfStatement,
                    alternate: null,
                    consequent: {
                        type: Syntax.BlockStatement,
                        body: otherConsequent,
                    },
                    test: itemNode.expression.expressions[0].left,
                };

                blockNode.body.splice(itemIndex, 1, newNode);
            }

            //  三元表达式转换
            if (
                itemNode.expression.type === Syntax.SequenceExpression &&
                itemNode.expression.expressions.length > 1 &&
                itemNode.expression.expressions[0].type ===
                    Syntax.ConditionalExpression
            ) {
                let otherConsequent = itemNode.expression.expressions.slice(
                    1,
                    itemNode.expression.expressions.length
                );

                otherConsequent.unshift(
                    itemNode.expression.expressions[0].alternate
                );
                otherConsequent = otherConsequent.map((item) => {
                    return {
                        type: Syntax.ExpressionStatement,
                        expression: item,
                    };
                });
                let newNode = {
                    type: Syntax.IfStatement,
                    consequent: {
                        type: Syntax.BlockStatement,
                        body: otherConsequent,
                    },
                    test: itemNode.expression.expressions[0].test,
                };

                blockNode.body.splice(itemIndex, 1, newNode);
            }

            if (itemNode.expression.type === Syntax.SequenceExpression) {
                const flatNodes = itemNode.expression.expressions.map(
                    (item) => {
                        return {
                            type: Syntax.ExpressionStatement,
                            expression: item,
                        };
                    }
                );

                blockNode.body.splice(itemIndex, 1, ...flatNodes);
            }
        }

        //  有返回值但是返回的不是单独数据，进行替换分割
        if (
            itemNode.type === Syntax.ReturnStatement &&
            itemNode.argument &&
            itemNode.argument.type !== Syntax.Identifier
        ) {
            if (itemNode.argument.type === Syntax.SequenceExpression) {
                let idenNode = itemNode.argument.expressions.pop();
                const otherNode = itemNode.argument.expressions.map((item) => {
                    return {
                        type: Syntax.ExpressionStatement,
                        expression: item,
                    };
                });

                itemNode.argument = idenNode;
                blockNode.body.splice(itemIndex, 0, ...otherNode);
            }
        }

        //  展开相同的返回对象
    }

    if (Object.keys(logIndexMap).length > 0) {
        for (let index = blockNode.body.length; index >= 0; index--) {
            if (logIndexMap[index]) {
                blockNode.body.splice(index, 0, logIndexMap[index]);
            }
        }
    }

    return blockNode;
}

//  代码块补充
export function ifBlockSupplement(
    blockNode: ESTree.Node,
    parent: null | ESTree.Node
) {
    // if (item.type === Syntax.IfStatement) {
    //     debugger;
    // }
    //  if条件补充大括号
    if (blockNode.type === Syntax.IfStatement) {
        if (blockNode.consequent.type !== Syntax.BlockStatement) {
            let consequentNode = {
                type: Syntax.BlockStatement,
                body: [blockNode.consequent],
            };
            blockNode.consequent = consequentNode;
        }
        if (
            blockNode.alternate &&
            blockNode.alternate.type !== Syntax.BlockStatement &&
            blockNode.alternate.type !== Syntax.IfStatement
        ) {
            let alternateNode = {
                type: Syntax.BlockStatement,
                body: [blockNode.alternate],
            };

            blockNode.alternate = alternateNode;
        }
    }

    if (blockNode.type === Syntax.ForStatement) {
        if (blockNode.body.type !== Syntax.BlockStatement) {
            const node = {
                type: Syntax.BlockStatement,
                body: [blockNode.body],
            };
            blockNode.body = node;
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
        blockNode.operator === "void" &&
        blockNode.argument.type === Syntax.Literal &&
        blockNode.argument.value === 0
    ) {
        const newNode = {
            type: Syntax.Identifier,
            name: "undefined",
        };

        return newNode;
    }

    if (
        blockNode.operator === "!" &&
        blockNode.argument.type === Syntax.Literal
    ) {
        const newNode = {
            type: Syntax.Identifier,
            name: new Function(
                `return ${blockNode.operator}${blockNode.argument.value}`
            )().toString(),
        };

        return newNode;
    }

    return blockNode;
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
        let filterStacks = stacks
            .filter((item) => item.includes(now_name))
            .filter((stackItem) => {
                const res = /^.*[\\/](.*?):(\d+):(\d*)/.exec(stackItem);
                if (!res) {
                    return false;
                }
                const [source, filename, line, lineIndex] = res;
                if (!now_name) {
                    now_name = filename;
                }
                if (parseInt(line, 10) <= codeLine) {
                    return false;
                }
                return true;
            });
        const val = filterStacks[0];
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
            console.log(target, prop, receiver);
            const result = envResult();
            let jStr = target;
            try {
                jStr = JSON.stringify(target, function (key, value) {
                    if (value == window) {
                        return {};
                    }
                    return value;
                });
            } catch (error) {}
            console.log(
                `${result.line}行${result.lineIndex}:${targetName}:对象`,
                jStr
            );
            console.log(
                `${result.line}行${result.lineIndex}:${targetName}:调用`,
                prop
            );
            const res = Reflect.get(target, prop, receiver);
            console.log(
                `${result.line}行${result.lineIndex}:${targetName}:返回`,
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
                        return {};
                    }
                    return value;
                });
            } catch (error) {}
            console.log(
                `${result.line}行${result.lineIndex}:${targetName}:对象`,
                jStr
            );
            console.log(
                `${result.line}行${result.lineIndex}:${targetName}:设置`,
                prop
            );
            console.log(
                `${result.line}行${result.lineIndex}:${targetName}:值`,
                value
            );
            const success = Reflect.set(target, prop, value, receiver);
            return success;
        },
    });

    return proxyTarget;
}

//  替换return
export function replaceReturn(
    blockNode: ESTree.Node,
    parent: null | ESTree.Node
) {
    if (blockNode.type !== Syntax.ReturnStatement) {
        return blockNode;
    }

    if (
        blockNode.argument &&
        blockNode.argument.type === Syntax.ConditionalExpression
    ) {
        const ifNode = {
            type: Syntax.IfStatement,
            alternate: {
                type: Syntax.BlockStatement,
                body: [
                    {
                        type: Syntax.ReturnStatement,
                        argument: blockNode.argument.alternate,
                    },
                ],
            },
            consequent: {
                type: Syntax.BlockStatement,
                body: [
                    {
                        type: Syntax.ReturnStatement,
                        argument: blockNode.argument.consequent,
                    },
                ],
            },
            test: blockNode.argument.test,
        };

        return ifNode;
    }

    return blockNode;
}


export function ifToSwitch(blockNode: ESTree.Node, parent: ESTree.Node | null) {
    if (!blockNode.type !== Syntax.IfStatement) {
        return;
    }
}

//  for变量声明
export function forVariable(
    blockNode: ESTree.Node,
    parent: ESTree.Node | null
) {
    if (blockNode.type !== Syntax.BlockStatement) {
        return;
    }

    for (let index in blockNode.body) {
        let nodeIndex = parseInt(index, 10);
        let node = blockNode.body[index];

        console.log(node);
        if (node.type !== Syntax.ForStatement) {
            continue;
        }

        if (
            node.init.type !== Syntax.SequenceExpression ||
            !Array.isArray(node.init.expressions) ||
            node.init.expressions.length <= 1
        ) {
            continue;
        }

        const otherNodes = node.init.expressions.splice(
            0,
            node.init.expressions.length - 1
        );
        for (let otherNode of otherNodes) {
            blockNode.body.splice(nodeIndex, 0, {
                type: Syntax.ExpressionStatement,
                expression: otherNode,
            });
        }
    }

    return blockNode;
}