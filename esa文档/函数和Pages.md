函数和Pages是边缘安全加速 ESA产品打造的一站式全栈开发平台，通过深度集成 Git 工作流、全球边缘网络与智能构建系统，为企业及开发者提供从代码提交到全球分发的一站式部署解决方案。平台支持静态网站、单页应用SPA（Single-Page Application）、服务端渲染SSR（Server-Side Rendering）应用以及边缘函数（Edge Functions）等多种应用场景，满足从个人项目到企业级复杂架构的多样化部署需求。

![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/1506027871/CAEQYxiBgIDV6sHRyxkiIGM3YmEzNGIzMmU2YzQ5MGRiZWFiMGZhYjljMzQ3YmU44020181_20230926172954.921.svg)

## **核心能力**

-   **自动化的构建和部署**：原生支持 GitHub，自动感知主干分支代码变更并完成构建和部署。
    
-   **全球边缘分发网络**：函数和Pages可秒级完成全球部署，所有请求通过分布式网络就近分发，确保终端用户获得最低延迟访问体验。
    
-   **企业级安全、合规、可运维**：与ESA安全加速无缝集成，让您的Pages网站快速具备WAF、抗DDos、Bots管理等安全能力。同时支持从生产环境的灰度发布，到完善的监控日志系统，全方位保障生产环境业务稳定性。
    
-   **边缘函数能力**：基于V8 Isolate提供低延迟的边缘函数服务，自动扩缩容，无需关心底层服务器等基础设施。
    
-   **开发者友好体验**：支持多端操作，提供 Web 控制台、命令行工具及 RESTful API等方式，满足自动化集成需求。
    

## **工作原理**

![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/1506027871/CAEQYxiBgMCGiuHL0hkiIDVjNDQ3MGZiM2FhNjQ2YzNhYTkzZGEyODA5Njg0MzQ55737937_20251105152238.951.svg)

-   **判断请求类型**：当客户端请求到达ESA边缘节点时，会进行请求类型分流——函数和Pages请求将进度独立模块进行优化处理。
    
-   **处理请求内容**：函数和Pages请求中的动态内容将交由函数模块进行计算处理，静态内容则由缓存模块获取缓存或回源获取资源。
    

## 基本概念

-   **函数**：函数是阿里云在边缘节点提供的JavaScript代码运行环境，可以执行您上传的JavaScript代码。使用函数产品时，您需要先创建函数，一个函数由两个部分组成：配置（包含函数的名称、描述等）和JS代码（即您上传的JavaScript代码脚本）。
    
-   **Pages**：Pages是基于ESA基础设施构建的一体化前端开发与部署平台，面向现代 Web 开发场景设计，赋能开发者高效完成静态站点与无服务器应用的构建及发布。平台深度集成函数，实现动静态资源的协同分发与业务逻辑的就近执行，显著提升内容交付效率与交互响应性能，全面支持全球用户低延迟访问。
    
-   **版本**：函数和Pages支持版本管理。您开发函数和Pages的过程中，JS代码必定是不断修改更新的，当某一个阶段的代码修改和测试完成后，您可以将该时刻的代码快照生成一个代码版本。当您发布函数和Pages时，您需要选择其中一个代码版本进行发布。系统为您提供版本回溯和管理历史代码能力。每个版本匹配一个版本号，版本号由系统自动生成。此外，平台支持基于百分比的灰度发布能力，可在测试环境及生产环境中同时发布两个函数和Pages版本，并自定义各版本的流量分配比例。例如：配置版本1占10%、版本2占90%，则用户请求将按对应概率路由至相应版本，实现精细化的灰度验证与风险可控的渐进式发布。
    
    ![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/1506027871/CAEQYxiBgMCc4b_SyxkiIGRlMTQzNWRiZDRjNzQ5OTg4OTY5ZWUzYWFiMThjZTc44020181_20230926143423.241.svg)
-   **环境**：函数提供测试环境、生产环境满足您开发测试和部署的不同需求：
    
    ![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/2506027871/CAEQURiBgMD22vP.mBkiIDM4Zjc0NmIwZTFkZDQwMDU5ZDhlMjBiMjc4ZTA0NzI54020181_20230926153521.514.svg)
    -   **测试环境**：测试环境是一个供您测试代码的独立边缘节点，测试环境模拟生产环境但与生产环境隔离，您在测试环境修改函数的配置或代码不会影响生产环境。测试环境需要根据页面提供的测试环境IP配置Host后才可访问。
        
    -   **生产环境**：生产环境也称线上环境，由遍布全球的大量边缘节点组成。当您在测试环境完成代码测试后，即可发布至生产环境。（上图仅为示例说明，函数将根据您的请求规模自动增减分配的节点，具体节点的区域分布以实际为准）。
        
-   **域名**：函数的调用方式。目前支持**域名绑定**和**路由**两种触发方式，您可以通过绑定域名将某个域名流量全部转发至函数，或者通过函数路由的方式将某个域名的部分流量转发至函数，具体请参见[配置域名](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/create-an-app-from-template#section-l52-msb-69o)。
    

## 使用限制

| **功能** | **限制项** | **限制** | **说明** |
| --- | --- | --- | --- |
| 函数  | 响应时间 | 120秒 | 函数单次执行的响应时间不能超过120秒（等待I/O也算作RT时间）。 |
| 等待时间 | 10秒 | 网关等待Functions的时间，如果Functions在10秒内仍不返回任何数据，则网关会主动断开连接，向客户端返回504状态码。 |
| 代码包大小 | 4 MB | 每个函数的JavaScript代码文件大小上限。 |
| 子请求数量 | 4个  | Functions单次执行允许fetch的请求数量。 |
| 开发语言 | JavaScript（ES6语法） | 目前仅支持JS，您需要有JavaScript编程能力。 |
| Pages | 文件数 | 2000个 | 每个Pages项目最多可上传2000个静态文件（如：HTML、CSS、JS、图片等）。 |
| 单个文件大小 | 25MB | 单个文件（如：视频、PDF、JS包）最大支持25MB。 |
| 包大小 | 1024MB | 整个项目源码压缩包（deploy package）最大支持1024MB。 |
您可以通过ESA提供的CLI工具进行Pages快速部署以及后续管理。

## **AK、SK准备**

通过CLI工具进行Pages创建时，需要以AccessKey为您的服务器进行ESA站点操作的授权，因此需要先获取对应的AccessKey信息。由于阿里云账号（主账号）拥有资源的所有权限，其AccessKey一旦泄露风险巨大，所以建议您创建并授权以满足最小化权限需求的RAM用户。

1.  使用RAM管理员账号登录[RAM控制台](https://ram.console.aliyun.com/)。
    
2.  在左侧导航栏选择**身份管理 > 用户**，在**用户**页面单击**创建用户**。![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/2442472671/p1016679.png)
    
3.  填写RAM用户的登录名称，如`esa-cli`，勾选**使用永久 AccessKey 访问**用以自动创建AccessKey信息，单击**确定**即可。![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/2442472671/p1016683.png)
    
4.  单击**复制**按钮保存当前RAM用户的**AccessKey ID**和**AccessKey Secret**。![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/2442472671/p1016688.png)
    
5.  在**用户**页面，在新建的RAM用户右侧配置项单击**添加权限**，为RAM用户配置可操作ESA的权限。![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/2442472671/p1016701.png)
    
6.  在**新增授权**页面，搜索权限策略关键词`ESA`，在搜索结果中勾选`AliyunESAFullAccess`，单击**确认新增授权**即可。![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/2442472671/p1016702.png)
    

## **通过CLI创建Pages**

**说明**

您需要先安装Node.js，可参考[Node.js安装](https://nodejs.org/download)以使用ESA CLI。

1.  执行以下指令，全局安装**esa-cli**工具**：**
    
    > 您也可以通过npx直接执行esa-cli命令。
    
    ```
    npm i esa-cli@latest -g  # 安装esa-cli工具
    ```
    
    ![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)
    
2.  执行以下指令，并使用上面获取的**AccessKey ID**和**AccessKey Secret**登录RAM用户，以获取ESA中的资源操作权限：
    
    ```
    esa-cli login  # 用户登录
    ```
    
    ![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)
    
3.  登录成功后即可进行Pages构建。输入以下指令：
    
    ```
    esa-cli init  # 通过模板创建新项目
    ```
    
    1.  **自定义项目名**：输入自定义名称，如`my-pages-from-cli`，回车继续配置。![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)
        
    2.  **选择创建方式**：默认选择`Framework Starter`，表示创建前端框架，回车继续配置。![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)
        
    3.  **选择前端框架**：选择您需要构建的框架，如`React`，回车继续配置。![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)
        
    4.  **选择编程语言：**选择您需要的编程语言，回车即可完成配置。![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)
        
    5.  等待工具将按配置完成自动构建。![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)
        
    6.  最后在自动部署阶段选择`Yes`即可自动部署。![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)
        
4.  等待系统构建完成后，将为您生成一个公共域名访问链接，可直接访问预览效果。
    
    **说明**
    
    该公共域名仅供测试使用，使用该域名访问需添加 token 进行鉴权，token 有效期为 60 分钟。
    
    ![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)
    
5.  完成配置后，您可以参考[alibabacloud-esa-cli](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/functions-and-pages-cli-tool)获取更多CLI指令进行后续管理。
    

## **如何绑定自定义域名**

域名绑定功能允许您将Pages链接至自己的站点域名，在完成域名绑定后，您可以直接使用该域名对Pages进行访问。

**重要**

需保证待绑定的域名已[接入ESA并激活](https://help.aliyun.com/zh/edge-security-acceleration/esa/getting-started/add-your-website-to-esa)。

1.  执行以下指令，将操作目录切换至需要绑定的项目所在目录。
    
    ```
    cd your-project-name  # 将your-project-name替换为实际的项目名称，如 my-pages-project
    ```
    
    ![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)
    
2.  执行以下指令，绑定自定义的域名即可。
    
    ```
    esa-cli domain add your-domain  # 将your-domain替换为实际的域名，如 pages.example.com
    ```
    
    ![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)
    
3.  在浏览器中访问自定义域名即可查看效果。![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)
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
    边缘安全加速 ESA为您提供 CLI 工具，您可以通过 CLI 工具进行函数和Pages全生命周期管理、调试、多文件功能部署等操作。

## ESA CLI介绍

ESA CLI是ESA函数和Pages配套命令行工具，通过ESA CLI您可以完成如下任务。

-   在本地完成函数和Pages全生命周期管理，包括函数和Pages创建、版本发布与部署、自定义域名或路由管理等。
    
-   在本地或内网环境完成函数调试。CLI支持启动本地调试服务，模拟线上环境进行功能测试。
    
-   支持多文件工程的部署。CLI将自动完成npm等项目依赖文件的打包构建，允许您将本地Node.js项目部署在云上。
    

## 常用命令

ESA CLI提供众多命令用来进行函数和Pages管理。全部指令详情可参考：[https://github.com/aliyun/alibabacloud-esa-cli](https://github.com/aliyun/alibabacloud-esa-cli)

| **命令** | **说明** |
| --- | --- |
| init | 选择ESA提供的模板完成项目初始化 |
| dev | 自动启动本地调试服务 |
| commit | 提交项目代码至云上，并将其保存为一个版本 |
| deploy | 将某个版本部署在所有线上边缘节点 |
| deployments | 查看当前的版本部署情况，或删除某个版本 |
| project | 查看所有函数和Pages，或删除某个函数 |
| site | 查看账户下所有站点信息 |
| domain | 管理绑定到函数和Pages的域名 |
| route | 管理绑定到函数和Pages的路由 |
| login | 使用 AK/SK 完成账号登录 |
| logout | 注销登录 |
| config | 管理ESA CLI 的配置文件 |
| lang | 选择ESA CLI 的语言 |

## **前提条件**

在安装ESA CLI之前，请确保您已安装 Node.js 和 npm。建议优先使用 Volta 或 nvm 等 Node 版本管理器进行安装。

## 使用ESA CLI

1.  使用npm完成ESA CLI 的安装，并查看 CLI 的版本和支持的命令。
    
    ```
    npm install esa-cli -g    # 全局安装CLI
    esa-cli -v                    # 查看CLI版本
    esa-cli --help                # 查看CLI命令
    ```
    
2.  **账号登录**：首先访问[阿里云RAM控制台](https://ram.console.aliyun.com/manage/ak)获取您的`AccessKey ID`和`AccessKey Secret`，再执行`esa login`完成账号登录。如果您只是通过 CLI 在本地进行代码调试，则不需要进行账号登录。
    
    ```
    esa-cli login        # 登录
    esa-cli logout       # 登出
    ```
    
3.  **项目初始化**：包括填写项目名称、选择模板等，可根据初始化命令引导完成整个流程。
    
    ```
    esa-cli init
    ```
    
4.  **本地调试**：完成代码后，可以通过 CLI 进行代码本地调试。执行`esa-cli dev`指令后，会自动打包入口文件，并启动本地调试服务。
    
    **基本使用方法：**
    
    -   在界面上按 `b` 即可在浏览器中打开调试页面。
        
    -   在界面上按 `d` 可以查看调试引导。注意：Chrome 不允许命令行打开调试页面。在 Chrome 浏览器中打开 `Chrome://inspect#devices` 页面，可以看到一个运行的`Remote Target`，点击下面的`inspect`即可查看 console 信息。注意，EdgeRoutine 的代码为服务端代码，所以预览页面的控制台并不会输出入口文件中的 `console`，只能通过`inspect`调试。
        
    -   在界面上按 `c` 可以清空面板。
        
    -   在界面上按 `x` 可以退出调试。
        
    -   可以用 `esa-cli dev --port <port>` 临时指定端口。
        
    
    本地调试时，也可以运行代码中的[边缘存储API](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/edge-storage-api)和[Cache API](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/cache-api)。
    
    **说明**
    
    为了线上数据安全，边缘存储服务在本地调试时不会获取和设置线上数据。如果需要在本地进行数据模拟，可以使用下面的方法：在函数项目根目录（与配置文件`esa.jsonc`同级），创建`kv.json`文件，按照下面的格式写入数据：
    
    ```
    {
      "namespace": {
        "k1": "v1",
        "k2": "v2"
        }
    }
    ```
    
    此时下面的代码可获取到模拟数据：
    
    ```
    const edgeKv = new EdgeKV({ namespace: 'namespace' });
    async function run() {
     const data = await edgeKv.get('k1', { type: 'text' });
     console.log(data); // 'v1'
    }
    ```
    

1.  **版本生成**：在本地调试完成后，需要生成一个代码版本用于部署。
    
    ```
    esa-cli commit      # 生成版本
    ```
    
2.  **线上部署**：当版本生成后，需要使用部署相关的指令，将版本部署至公有云边缘节点。
    
    ```
    esa-cli deploy                          # 根据提示选择版本、目标环境即可部署
    esa-cli deployments list                # 查看部署情况
    esa-cli deployments delete <versionId>  # 删除指定版本
    ```
    
3.  **管理自定义域名或路由**：
    
    当被部署到节点后，您可以配置自定义域名或路由，以访问您的函数和Pages：
    
    1.  **域名**：为您的函数和Pages绑定域名，该域名必须是您ESA站点的子域名，您可以通过域名直接访问到该函数，此时函数和Pages将作为该域名的源站。
        
    2.  **路由**：为您的ESA站点绑定路由，访问该路由可触发函数和Pages执行，此时函数和Pages可以和站点的源站进行通信。
        
    
    ```
    # 域名
    esa-cli domain list
    esa-cli domain add <domainName>     # 需要是您的已备案域名
    esa-cli domain delete <domainName>
    
    # 路由
    esa-cli route list
    esa-cli route add [route] [site]
    esa-cli route delete <route>
    ```
    
4.  **管理函数**：可以通过 CLI 查看、删除函数。
    
    ```
    esa-cli project list                  # 查看函数
    esa-cli project delete <PROJECT_NAME>   # 删除函数
    ```
    边缘安全加速 ESA支持直接导入Github仓库，可通过已有的仓库代码快速启动并部署项目。

## **前提条件**

-   已开通函数和Pages服务。
    
-   拥有一个[可用的Github账号](https://github.com/signup)和代码仓库。
    

## **操作步骤**

Pages 与代码管理系统无缝集成，使开发工作流与部署过程之间能顺畅同步。

1.  登录[ESA控制台](https://esa.console.aliyun.com/)，在左侧导航栏选择**边缘计算和 AI** > **函数和Pages**。
    
2.  在边缘函数页面，单击**创建**。
    
3.  选择**导入 Github 仓库**页签，单击**添加 GitHub 账号**。
    
    ![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/1767314671/p1003645.png)
    
4.  登录Github账号后，在授权页面默认选择**All repositories**，单击**Install & Authorize**完成仓库授权。![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/7466168571/p1007263.png)
    
5.  选择需要构建的对应仓库名，单击**下一步**。
    
    **说明**
    
    连接GitHub账号后，仓库列表默认**仅展示公开仓库**，私有仓库不会自动显示。如需选择私有仓库，请在搜索框中输入仓库名称进行搜索。
    
    ![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/1767314671/p1003682.png)
    
6.  填写构建信息，单击**开始部署**。
    
    ![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/1767314671/p1003684.png)
    
    | **配置类型** | **功能** | **说明** |
    | --- | --- | --- |
    | 基础配置 | 生产分支 | 默认为`main`分支。ESA将按照所选分支自动触发构建并自动部署到生产环境。 |
    | 非生产分支构建 | 开启后，将对非生产分支（比如非`main`分支）的新提交生成构建版本，但不会自动部署。 |
    | 安装命令 | 若需先安装依赖，填写命令，例如 `npm install`。支持`npm`、`yarn`、`cnpm`、`pnpm`。 |
    | 构建命令 | 若需先构建，填写命令，例如`npm run build`。支持`npm`、`yarn`、`cnpm`、`pnpm`。 |
    | 高级配置 | 根目录 | 构建命令将在此目录下执行，默认`/`。若是`monorepo`，请填写要构建的子项目路径（例如 `/frontend`或 `/packages/web`）。 |
    | 静态资源目录 | 构建产物中将被静态托管的目录，例如：`./public`、`./dist` 或 `./build`。您可以在[esa.jsonc](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/build-pages)文件的`assets.directory`字段中指定静态资源目录。该配置的优先级高于**构建信息**中的配置，会覆盖您在此处的配置。 |
    | 函数文件路径 | 函数的入口文件路径，即实际执行的文件。例如：`./src/index.ts`。您可以在[esa.jsonc](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/build-pages)文件的`entry`字段中指定函数文件路径。该配置的优先级高于**构建信息**中的配置，会覆盖您在此处的配置。 |
    | Node.js版本 | 构建使用的 Node.js 版本。修改该配置后，需要重新触发构建才能生效。您可以在`package.json`文件的`engines.node`字段中指定Node.js主版本。该配置的优先级高于**构建信息**中的配置，会覆盖您在此处的配置。 |
    | 环境变量 | 设置构建过程中可使用的环境变量，可以通过全局对象`process.env`获取。 |
    
7.  等待系统构建完成后，将为您生成一个公共域名访问链接，可直接访问预览效果。
    
    **说明**
    
    该公共域名仅供测试使用，使用该域名访问需添加 token 进行鉴权，token 有效期为 60 分钟。
    
    ![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/7466168571/p1007886.png)
    

## **如何绑定自定义域名**

完成创建后，为便于后续访问，您可以参考[域名配置](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/trigger)，将函数与Pages绑定至您已有的域名。
