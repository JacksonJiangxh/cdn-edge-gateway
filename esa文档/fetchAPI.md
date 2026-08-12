Fetch API是一种从边缘节点获取数据的方法。通过Fetch API，您可以使用HTTP或HTTPS协议从边缘节点请求数据，并将数据返回给用户。它类似于浏览器环境中的Fetch API，可以用于动态加载内容、与后端服务进行交互、实现A/B测试等场景。

## Fetch API方法定义

Fetch是完全异步的线程，只要您不使用`await`，Fetch就不会阻塞脚本执行。目前每次可以发起4个子请求。由于底层采用的是长连接，您无需担心性能，也不用主动处理连接池。

Fetch可以进行HTTP或HTTPS请求，每一次`redirect`都算一次请求。每一个Fetch最多可以支持12次`redirect`。

-   方法定义
    
    `fetch(arg, init)`，Fetch的详细定义请参见MDN官方文档[WorkerOrGlobalScope.fetch()](https://developer.mozilla.org/zh-CN/docs/Web/API/WindowOrWorkerGlobalScope/fetch)。
    
-   方法限制
    
    -   目前Fetch API只支持域名，不支持IP地址。HTTP请求对应的端口为80，HTTPS请求对应的端口为443。
        
    -   `init`参数内部的`credentials`、`referrer`、 `referrerPolicy`、`cache`和`integrity`无任何意义。
        
    -   `redirect`默认值为`follow`，即fetch时如果源站返回3xx会直接跟随。如果不需要跟随3xx，需将`redirect`设置为`manual`。
        
    
    **说明**
    
    -   对浏览器内部的多种Fetch模式不做区分，例如`CROS fetch`，在CDN/DCDN/ESA上您可以Fetch任何源站。
        
    -   如果需要4个及以上的子请求时，请[填写信息](https://page.aliyun.com/form/act2017566026/index.htm)申请配额。
        
    -   请求URL的总长度不超过4 KB。
        
    -   函数通过Fetch获取的gzip压缩资源默认解压。如不希望默认解压内容，请参见下方Decompress章节添加`manual`参数。
        
    
-   设置超时时间
    
    -   Timeout函数
        
        ```
        /**
         * 请求超时控制实现
         *
         * @param {Number} timeout 超时等待时间，单位ms
         * @param {Object} config 超时配置
         *   - @param {Object|Funtion} handler 超时返回
         * @returns
         */
        const RequestTimeout = (timeout, config) => {
          return new Promise((resolve) => {
            const { handler = null } = config;
            let timer = setTimeout(() => {
              clearTimeout(timer);
              timer = null;
        
              const defaultRes = (typeof handler === 'function' ? handler() : handler) || {};
              resolve(defaultRes);
            }, timeout);
          });
        };
        ```
        
    -   调用示例
        
        ```
        const KV_TIMEOUT = 1000;
        let edgekv = new EdgeKV({
          namespace: KV_NS,
        });
        
        let kvRequest = edgekv.get(key, getType);
        let timeoutPromise = RequestTimeout(KV_TIMEOUT, {
          handler: {
            res: {},
            errorMessage: `kv request timeout (${KV_TIMEOUT}ms)`,
          }
        });
        
        let resp = await Promise.race([
          kvRequest,
          timeoutPromise,
        ]);
        
        if (resp === undefined) {
          return "kv not found, key = " + key;
        } else {
          return resp;
        }
        ```
        

## Redirect

Fetch运行支持3xx跟随，即3xx重定向。3xx包含的status code有301、302、303、307和308。根据标准您可以指定以下三种行为。

-   `{redirect: "manual"}`：不跟随3xx，您自己处理。
    
-   `{redirect: "error"}`：3xx直接报错。
    
-   `{redirect: "follow"}`：（默认值）跟随3xx，最多支持20次。
    

重定向方案见下表。

| **状态码** | **重定向说明** |
| --- | --- |
| 301、302、303、308 | 请求方法改成GET，body被忽略。 |
| 307 | 只跟随GET方法，其他方法会报错。 |

**说明**

重定向的地址来源于`Location`头，`Location`必须出现，否则会报错。

-   `Location`可以含有由一个英文逗号`,`分割的URL表单，但只有第一个会被使用，其他均被忽略。
    
-   `Location`可以含有绝对URL或者相对URL。
    

## Decompress

Fetch允许您配置API的解压缩模式，例如`fetch("https://www.example.com"，{decompress: "manual"})`。Fetch的decompress参数有以下三种值：

-   manual：不解压缩。如果Fetch的服务器将压缩后的数据发送回来，则在ER中会读取到被压缩的数据。
    
-   decompress（默认值）：自动解压缩。目前Fetch支持Gzip压缩模式，ER会根据content-encoding头自动侦测或者使用解压缩。ER如果执行了解压缩，会自动修改content-encoding的值。如果删除了其中的Gzip项，为了防止透传时出现错误，您可以在下面两种方式中任选一种进行设置：
    
    -   `content-encoding：gzip`表示可以被ER识别。
        
    -   `content-encoding：gzip, identity`表示可以被ER识别。
        
    
    **说明**
    
    其他非Gzip的算法，目前会报错。
    
-   fallbackIdentity：类似decompress，如果无法识别压缩，则默认不解压缩。
    

**重要**

Fetch自动压缩后如果回复中有content-length头，不能随意透传content-length头，因为此时content-length表示未被解压缩前的字符大小，不再反映解压缩完成后的数据大小。

## content-length

如果您使用Fetch请求数据时设置了`content-length`，Fetch会采用`content-length`的编码，同时会改变Fetch发送body的默认行为。如果您不设置`content-length`，Fetch会主动把body流的所有数据读取出来并发送，发送使用chunk-encoding。

-   `content-length`设置
    
    -   `content-length`为非负数：根据您设置的值从发送的body流读取相应的字节后发送，发送采用`content-length`。如果`content-length`为0，则不发送任何数据。
        
    -   `content-length`为非法值：继续使用chunk-encoding发送所有body的值。
        
-   举例说明
    
    Fetch会自动解压缩内容，解压缩后response的`content-length`仍然存在，该`content-length`表示未被解压缩前的数据大小。如果您改动body后再使用Fetch需注意`content-length`，否则发送的内容可能会出错。
    
    以下示例中，假设客户端发送了一个POST请求，且header中包含了`content-length`。当您使用Fetch进行请求时，由于body复用了客户端request的header对象，会导致`content-length`的值和当前发送的body实际数据大小不一致。您透传header时一定要关注body的实际大小是否发生改变。
    
    ```
    export default {
      fetch(request) {
        return handleRequest(request)
      }
    }
    async function handleRequest(request) {
      return fetch("http://www.example.com", {
        headers: request.headers,
        method: request.method,
        body: "SomeData"
      });
    }
    ```
    

## Headers

-   定义
    
    Headers的定义，请参见MDN官方文档[Headers](https://developer.mozilla.org/zh-CN/docs/Web/API/Headers)。
    
-   限制
    
    header内部会记录内存消耗，header对象可以存储的最大header是8 KB。如果单个header对象超用，会触发JS exception。
    
-   黑名单
    
    header有黑名单，无法读写以下头，如果您读取会造成exception。
    
    -   expect
        
    -   te
        
    -   trailer
        
    -   upgrade
        
    -   proxy-connection
        
    -   connection
        
    -   keep-alive
        
    -   dnt
        
    -   host
        
    -   其他内部头
        
    

## Request

-   定义
    
    Request的定义，请参见MDN官方文档[Request](https://developer.mozilla.org/zh-CN/docs/Web/API/Request)。
    
-   限制
    
    Request对象的以下属性没有实现，在CDN/DCDN/ESA上下文中没有意义。
    
    -   context
        
    -   credentials
        
    -   destination
        
    -   integrity
        
    -   mode
        
    -   referrer
        
    -   referrerPolicy
        
    -   cache
        
    
-   常见使用
    
    -   获得请求方法：`request.method`。
        
    -   获得请求url：`request.url`。
        
    -   获得请求头：`request.headers`。
        
    -   获得请求负载：`request.body`，body是一个ReadableStream对象。
        
    -   获得JSON：`await request.json()`。
        
    -   获得表单数据：`await request.formData()`。
        
    -   获得UTF8字符串：`await request.text()`。
        
    
    Request接口是标准的扩充，既可以忽略body，又确保body可以读完，且不会将内存读入JavaScript虚拟机，从而避免了GC造成的延时，确保请求流的body从底层的socket中全部读出。对于`await request.ignore()`，如果您不需要读取Fetch的body或者不感兴趣，建议所有的Fetch请求都调用`request.ignore`，可以有效提高性能，因为运行时会自动把读取完body的请求发送至连接池中供下次复用。
    

## Response

-   定义
    
    Response的定义，请参见MDN官方文档[Response](https://developer.mozilla.org/zh-CN/docs/Web/API/Response)。
    
-   限制
    
    Response对象的useFinalURLS和error属性没有实现，在CDN/DCDN/ESA上下文中没有意义。
    
-   常见使用
    
    -   获得回复码：`response.status`。
        
    -   获得回复reason phrase：`response.statusText`。
        
    -   获得回复头：`response.headers`。
        
    -   获得回复URL：`response.url`，表示该回复是对应的URL发送的。
        
    -   获得所有redirect的URL list，属于非标准：`response.urlList`，类似Request对象实现了body mixin，使用类似方法您可以获得body对象。
        

## FormData

-   定义
    
    FormData的定义，请参见MDN官方文档[FormData](https://developer.mozilla.org/zh-CN/docs/Web/API/FormData)。
    
-   限制
    
    FormData类似Header，有内部大小限制，如果过大FormData会出现异常。如果把FormData当作HTTP body发送，默认的`content-type`是`form-data/multipart`。
    

## URLSearchParams

-   定义
    
    URLSearchParams的定义，请参见MDN官方文档[URLSearchParams()](https://developer.mozilla.org/zh-CN/docs/Web/API/URLSearchParams/URLSearchParams)。
    
-   限制
    
    如果把URLSearchParams当作HTTPbody发送，默认的`content-type`是`application/x-www-form-urlencode`，最大限制为1000字节。
    

## Blob和File

-   定义
    
    -   Blob的定义，请参见MDN官方文档[Blob](https://developer.mozilla.org/zh-CN/docs/Web/API/Blob)。
        
    -   File的定义，请参见MDN官方文档[File](https://developer.mozilla.org/zh-CN/docs/Web/API/File)。
        
-   限制
    
    为了与标准保持一致，ER提供了Blob和File这两个类。由于ER不支持读写文件，为了满足标准，您可以使用这两个类，如果使用这两个类提供给回复的body，`content-type`是`Blob`和`File`设置的mime type，和标准一致。