Pages可以通过`esa.jsonc`文件快速配置构建信息，并且可自定义不同应用场景下的路由行为。

## **以esa.jsonc进行Pages构建**

在Github中对应的项目根目录中创建 `esa.jsonc` 文件。该文件允许您定义和覆盖项目的默认设置，以便更灵活地配置项目。

### **优势**

-   **基础设施即代码** ：配置与您的代码一同被版本控制，每一次变更都有迹可循。
    
-   **易于团队协作**： 团队所有成员共享同一份配置文件，确保了本地开发和云端部署的一致性。
    
-   **便捷回滚**：任何时候都可以回滚到历史上的任意一次提交，并精确复现当时的构建环境。
    

### **生效优先级**

`esa.jsonc` 文件中的配置优先级大于控制台界面上的配置：

-   如果您的项目中没有 `esa.jsonc` 文件：
    
    -   您可以在项目的详情页面参考[如何通过控制台修改基础配置信息](#366e0d182dvu4)调整相关构建选项。
        
    -   控制台的配置将作为本次及后续部署的依据。
        
-   如果您的项目中存在 `esa.jsonc` 文件：
    
    -   系统会自动检测到该文件，并将其作为配置的唯一来源。
        
    -   在项目的详情页面，所有被 `esa.jsonc` 管理的配置项将不生效。
        
    -   如需修改配置，必须直接编辑 `esa.jsonc` 文件，并将更改推送到您的 Github 仓库。
        

### **配置示例**

在Github中对应的Pages仓库中新增`esa.jsonc`文件，配置示例可参考：

```
{
  "name": "vite-react-template",
  "entry": "./src/index.js",
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "assets": {
    "directory": "./dist",
    "notFoundStrategy": "singlePageApplication"
  }
}
```

| **参数** | **说明** |
| --- | --- |
| **name** | 指定部署的目标项目。如果该项目已存在，部署将在其下进行；如果不存在，系统将使用此名称自动为您创建一个新项目。 |
| **entry** | 边缘函数的入口执行文件路径，例如： `./src/index.ts`。 |
| **installCommand** | 配置自定义安装指令，例如：`npm install`。该配置会覆盖控制台的安装命令配置，如果设置成空字符串，安装步骤将被跳过。支持的包管理器包括：npm、pnpm、yarn、cnpm、bun。 |
| **buildCommand** | 配置自定义构建命令，例如：`npm run build`。该配置会覆盖控制台的构建命令配置，如果设置成空字符串，构建步骤将被跳过。 |
| **assets** | 静态资源托管功能允许开发者在ESA函数和Pages上运行前端网站。您可以配置资产目录，每个Pages只能配置一组静态资源，assets 提供了以下选项： - `directory`：构建产物中将被静态托管的目录，例如：`./public`、`./dist` 、 `./build`等。 - `notFoundStrategy` ：当请求的路径未匹配到任何静态资源时，执行的策略。 - **singlePageApplication：**返回静态托管目录的`index.html`文件及 `200 OK`状态码。适用于单页应用时。 - **404Page**：返回静态托管目录的`404.html`文件及 `404 Not Found` 状态码。 **说明** 若您同时配置了函数脚本与`assets.notFoundStrategy`选项，那么导航请求将不会触发该函数脚本的执行。导航请求：指浏览器在用户直接访问页面时（例如在地址栏输入URL或点击链接）自动发出的请求，其特征是包含了`Sec-Fetch-Mode: navigate`请求头。 |

## **静态资源的路由**

当完成`esa.jsonc`文件配置后，请求的 URL 与静态资源目录中的文件路由结果将会按照以下场景进行:

### **默认模式**

当在`esa.jsonc`中未配置`notFoundStrategy`字段时，如：

```
{
  "name": "vite-react-template",
  "entry": "./src/index.js",
  "assets": {
    "directory": "./dist"
  }
}
```

ESA将根据下述流程进行路由：

![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/3653804871/CAEQYxiBgMDdzbzZyxkiIDI0ZjEzYWZiNWI4ODQ0MDQ5YzQ2MzI1M2ZmMWY1MWQ15714308_20250923170854.043.svg)

1.  客户端请求URL到达边缘节点时，将会判断是否有对应的静态资源：若有，则直接响应对应静态文件；若无，则继续判断2。
    
2.  判断是否有ER函数脚本：若有，则执行ER函数脚本；若无，则响应`404 Not Found`。
    

### **单页应用**

当您构建的应用为单页应用类型，可以在`esa.jsonc`中配置`notFoundStrategy`字段为 `singlePageApplication` 模式，如：

```
{
  "name": "vite-react-template",
  "entry": "./src/index.js",
  "assets": {
    "directory": "./dist",
    "notFoundStrategy": "singlePageApplication"
  }
}
```

ESA将根据下述流程进行路由：

![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/3653804871/CAEQYxiBgIDZjNfZyxkiIGE3MTVlOTEyYzhhMTQzN2NhMzMxZWYzNjcyZmYzNjZj5714308_20250923170854.043.svg)

1.  客户端请求URL到达边缘节点时，将会判断是否有对应的静态资源：若有，则直接响应对应静态文件；若无，则继续判断2。
    
2.  判断是否为导航请求（请求头携带`Sec-Fetch-Mode: navigate`）：若否，则继续判断3；若是，则将请求路由至`/index.html`文件，继续判断a：
    
    1.  判断是否存在index HTML页面：若有，则响应`200 OK`并且返回`/index.html`内容；若无，则继续判断3。
        
3.  判断是否有ER函数脚本：若有，则执行ER函数脚本；若无，则响应`404 Not Found`。
    

### **静态站点生成**

当您构建的应用为静态站点生成类型，可以在`esa.jsonc`中配置`notFoundStrategy`字段为 `404Page` 模式，如：

```
{
  "name": "vite-react-template",
  "entry": "./src/index.js",
  "assets": {
    "directory": "./dist",
    "notFoundStrategy": "404Page"
  }
}
```

ESA将根据下述流程进行路由：

![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/3653804871/CAEQYxiBgMDnsOnZyxkiIDY5Yzk4ZTQ0NWU1NjQ3NTRhMjZjZTViODQ2ZTI0NGRi5714308_20250923170854.043.svg)

1.  客户端请求URL到达边缘节点时，将会判断是否有对应的静态资源：若有，则直接响应对应静态文件；若无，则继续判断2。
    
2.  判断是否为导航请求（请求头携带`Sec-Fetch-Mode: navigate`）：若否，则继续判断3；若是，则将请求路由至`/404.html`文件，继续判断a：
    
    1.  判断是否存在404 HTML页面：若有，则响应`200 OK`并且返回`/404.html`内容；若无，则继续判断3。
        
3.  判断是否有ER函数脚本：若有，则执行ER函数脚本；若无，则响应`404 Not Found`。
    

### 默认HTML路由处理

Pages 默认开启自动尾部斜杠行为。当请求的 URL 路径不以斜杠（`/`）结尾，且对应路径为目录而非具体文件时，Pages 会自动将请求重定向至添加了尾部斜杠的路径。例如，访问 `/about` 时，Pages 将重定向至 `/about/`。此为默认行为，无需在 `esa.jsonc` 中额外配置，对所有路由模式（默认模式、单页应用、静态站点生成）均生效。

| **请求的路径** | **响应结果** | **Asset** |
| --- | --- | --- |
| `/file` | 响应`/file` | 例如`/dist/file.html` |
| `/file.html` | 重定向至`/file` | /   |
| `/file/` | 重定向至`/file` | /   |
| `/file/index` | 重定向至 `/file` | /   |
| `/file/index.html` | 重定向至`/file` | /   |
| `/folder` | 重定向至`/folder/` | /   |
| `/folder.html` | 重定向至`/folder` | /   |
| `/folder/` | 响应`/folder/` | 例如`/dist/folder/index.html` |
| `/folder/index` | 重定向至`/folder` | /   |
| `/folder/index.html` | 重定向至`/folder` | /   |

## **如何通过控制台修改基础配置信息？**

1.  登录[ESA控制台](https://esa.console.aliyun.com/)，在左侧导航栏选择**边缘计算和 AI** > **函数和Pages**。
    
2.  在**函数和Pages**页面，单击目标Pages。
    
3.  选择**基本信息**页签，在**构建信息**，单击**修改**。
    
    ![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/6348648671/p1009434.png)
    
4.  根据业务需求，变更**构建信息**。
    
    ![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/6348648671/p1009408.png)
    
    | **参数** | **说明** |
    | --- | --- |
    | 根目录 | 构建命令将在此目录下执行，默认`/`。若是`monorepo`，请填写要构建的子项目路径（例如 `/frontend`或 `/packages/web`）。 |
    | 静态资源目录 | 构建产物中将被静态托管的目录，例如：`./public`、`./dist` 或 `./build`。您可以在[esa.jsonc](#)文件的`assets.directory`字段中指定静态资源目录。该配置的优先级高于**构建信息**中的配置，会覆盖您在此处的配置。 |
    | 函数文件路径 | 函数的入口文件路径，即实际执行的文件。例如：`./src/index.ts`。您可以在[esa.jsonc](#)文件的`entry`字段中指定函数文件路径。该配置的优先级高于**构建信息**中的配置，会覆盖您在此处的配置。 |
    | Node.js版本 | 构建使用的 Node.js 版本。修改该配置后，需要重新触发构建才能生效。您可以在`package.json`文件的`engines.node`字段中指定Node.js主版本。该配置的优先级高于**构建信息**中的配置，会覆盖您在此处的配置。 |
    | 环境变量 | 设置构建过程中可使用的环境变量，可以通过全局对象`process.env`获取。 |