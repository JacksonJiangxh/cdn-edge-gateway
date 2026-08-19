边缘函数用于将轻量级静态站点直接托管至ESA边缘节点，可以帮助您的业务在降低源站服务器负载的基础上获得更低延迟的响应体验。接下来将为您介绍如何使用边缘函数查看边缘存储（KV）中的Key值。

## 代码示例

-   **实现效果**：使用边缘函数查看KV中的Key值。
    
-   **语言类型**：`JavaScript`
    
-   **代码示例**：
    
    ```
    // 定义一个异步函数 handleRequest
    async function handleRequest(request) {
      try {
      // 初始化 Edge KV 连接
        const edgeKV = new EdgeKV({ namespace: "kv" });// 命名空间是 kv
        let getType = { type: "text" };
        let value = await edgeKV.get("key", getType);
        // 检查键是否存在
        if (value === undefined) {
          return "EdgeKV get: key not found";// 错误：直接返回字符串，而非 Response
        } else {
          return new Response(value);// 正确：返回 Response 对象
        }
      } catch (e) {
        return "EdgeKV get error" + e;// 错误：直接返回字符串，而非 Response
      }
    }
    // 导出默认的 fetch 处理函数
    export default {
      async fetch(request) {
        return handleRequest(request);// 返回 handleRequest 的结果
      }
    };
    ```
    

### **部署效果**

通过在浏览器中访问边缘函数绑定的指定函数或配置的特定路由地址，可看到具体的Key值。假设Key值为888888，路由地址为https://10.10.10.10，当您在浏览器中访问https://10.10.10.10时，可看到页面显示为888888。

![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/1692037471/p935854.png)