// @ts-nocheck
import Fs from "fs";
import * as esprima from "esprima";
import * as estraverse from "estraverse";
import { Syntax } from "estraverse";
import babelCore from "@babel/core";
import babelTypes from "@babel/types";
import escodegen from "escodegen";
import {
    replaceContion,
    flatStatement,
    ifBlockSupplement,
    replaceVoid,
    replaceReturn,
    watchChange,
    forVariable,
} from "./util";
// const esprima = require("esprima");
// const estraverse = require("estraverse");

// 全局变量对象
const global_variable: { [key: string]: any } = {};
//  变量注释
const variable_comment: { [key: string]: string } = {};
const types: Set<string> = new Set();

// 函数类型
const functionArray = [Syntax.FunctionDeclaration];

function tidy_seq(ifConseq, nodeConseq) {
    if (nodeConseq.type === Syntax.SequenceExpression) {
        // 拆开语句
        for (let i = 0; i < nodeConseq.expressions.length; i++) {
            let expState = esprima.parseScript("a").body[0];
            expState.expression = nodeConseq.expressions[i];
            ifConseq.body.push(expState);
        }
    } else {
        let expState = esprima.parseScript("a").body[0];
        expState.expression = nodeConseq;
        ifConseq.body.push(expState);
    }
}

function cond_to_if(node) {
    let ifNode = esprima.parseScript("if(a){}else{}").body[0];

    ifNode.test = node.test;
    // if 语句
    tidy_seq(ifNode.consequent, node.consequent);

    // else 语句
    if (node.alternate) {
        tidy_seq(ifNode.alternate, node.alternate);
    } else ifNode.alternate = null;

    return ifNode;
}

//  加载全局变量
function loadGlobalVariable(codeAst: esprima.Program) {
    for (let index in codeAst.body) {
        const codeLine = parseInt(index, 10);
        console.log(`第${codeLine + 1}个代码块`);
        const codeItem = codeAst.body[codeLine];
        console.log(codeItem);
        switch (codeItem.type) {
            case Syntax.ExpressionStatement:
                if (codeItem.expression.left === Syntax.Identifier) {
                    global_variable[codeItem.expression.left.name] =
                        codeItem.expression.right;
                }
                break;
            case Syntax.VariableDeclaration:
                codeItem.declarations.map((declarationItem) => {
                    global_variable[declarationItem.id.name] = declarationItem;
                });
                break;
            case Syntax.FunctionDeclaration:
                global_variable[codeItem.id.name] = codeItem.body;
                break;
            case Syntax.BlockStatement:
                break;
            default:
                break;
        }
    }
    // estraverse.traverse(codeAst, {
    //     enter(node, parent: null | any) {
    //         console.log("enter", Reflect.get(node, "name"), node.type);
    //         console.log("enter", node.type);
    //         types.add(node.type);

    //         if (types.size >= 100) {
    //             throw Error("AA");
    //         }

    //         switch (node.type) {
    //             case Syntax.Program:
    //                 break;
    //             case Syntax.UnaryExpression:
    //                 if (
    //                     node.operator === "void" &&
    //                     parent?.type === Syntax.ExpressionStatement
    //                 ) {
    //                     return node.argument;
    //                 }
    //                 break;
    //             default:
    //                 break;
    //         }
    //         return node;
    //     },
    //     leave(node, parent) {
    //         console.log("leave", node);
    //     },
    // });
    // console.log(types);
}

function unaryParse(codeAst: esprima.Program) {
    codeAst = estraverse.replace(codeAst, {
        enter(node, parent) {
            if (
                node.type !== Syntax.ExpressionStatement &&
                node.expression.type !== Syntax.UnaryExpression
            ) {
                return node;
            }
        },
        leave(node, parent) {
            console.log("跳出", node);
        },
    });
}

function main() {
    const startTime = Date.now();
    const jsData = Fs.readFileSync("./test1.js", {
        encoding: "utf-8",
    });
    // console.log(esprima);
    let ast = esprima.parseScript(jsData, {
        comment: true,
    });
    console.log(ast);

    loadGlobalVariable(ast);

    let times = 3;
    while (times--) {
        ast = estraverse.replace(ast, {
            enter: ifBlockSupplement,
        });
        ast = estraverse.replace(ast, {
            enter: replaceVoid,
        });
        ast = estraverse.replace(ast, {
            enter: flatStatement,
        });
        ast = estraverse.replace(ast, {
            enter: replaceContion,
        });
        ast = estraverse.replace(ast, {
            enter: replaceReturn,
        });
        ast = estraverse.replace(ast, {
            enter: forVariable,
        });
    }

    const endTime = Date.now();
    console.log(`转换AST完成，耗时:${(endTime - startTime) / 60}秒`);
    const jsCode = escodegen.generate(ast);
    Fs.writeFileSync("./ast_test.js", jsCode, {
        encoding: "utf-8",
    });
    console.log("生成文件");
}

main();
