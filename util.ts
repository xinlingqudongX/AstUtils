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