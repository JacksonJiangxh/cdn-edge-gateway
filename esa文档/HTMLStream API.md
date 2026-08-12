HTMLStream API是一种处理HTML流式数据的方法。通过HTMLStream API，您可以在边缘节点上处理HTML流式数据，例如实时更新的股票数据或实时聊天记录。HTMLStream API可以将HTML流式数据分块传输，提高数据传输效率。

## 背景介绍

在边缘程序ER（EdgeRoutine）的场景中前端场景占了很大一部分，由于边缘有不少特殊的请求数据，例如UA、地理信息和IP等，因此有不少需要在边缘实时更改HTML的需求。常规的更改方式是使用正则表达式制作adhoc的解析器更改，但使用该方法容易出错且不利用流式处理，使用开源JavaScript的解析器，例如parse5、htmlparser2等，对内存的消耗大、性能损失高。为了解决该问题，ER推出了边缘的HTML流式解析器，专门用于流式的修改HTML代码和页面。

**说明**

该功能并非Web标准，属于ER内置的扩充功能。

## 举例说明

-   场景描述
    
    假设您需要将HTML页面中所有的`<a/>` 标签修改后全部指向`http://www.taobao.com`，在ER中您可以使用以下代码实现。
    
-   代码示例
    
    ```
    async function handleRequest(request) {
      // 1.假设exmaple页面返回的是待修改的HTML页面。
      const response = await fetch("http://www.example.com");
      // 2.您需要设置好HTML流式解析器。流式解析器允许您设置多个不同CSS Selector
      //    语法的捕获方式，然后注册回调函数进行改写。
      const htmlStream = new HTMLStream(
        response.body, // 放入需要改写的HTML流
        [[
          "a",         // 元素选择器，表示选择所有的`a`标签。
          {  
            // 注册回调函数对象，名为element的回调函数会在a标签（在DOM中为ElementNode）被调用。
            // 调用时您可以传入object来更改e的信息。
            element: function(e) {
              // 更改属性href
              e.setAttribute("href", "http://www.taobao.com");
            }
          }
        ]]);
      
      // 3.返回修改后的请求到浏览器。HTMLStream是个ReadableStream，所以任何能使用
      //    ReadableStream的地方均可使用HTMLStream。
      return new Response(htmlStream);
    }
    
    export default {
      async fetch(request) {
        return handleRequest(request);
      }
    };
    ```
    
-   结果分析
    
    以上代码便是简单的使用HTMLStream实时修改HTML页面流的方法，具体分析如下：
    
    -   通过Fetch您可以得到一个对请求回复的流的表示，实际ER可能没有从网络层读取body，该设计可以减少缓冲引起的大量GC问题。
        
    -   HTMLStream也是一个流，他的作用是TransformStream，即接受一个流，然后通过您注册的重写handler实时更改HTML页面。如果您要修改一个HTML页面，需要得到对应HTML的原始数据流，再把这个流当作输入，放入到新创建的HTML流中，例如上述代码示例中的示例2。
        
        -   HTMLStream的第一个参数是一个流，表示HTML原始数据。
            
        -   HTMLStream的第二个参数是个数组，表示一组重写器。重写器实际是一个数组，它包含一个选择器，用于选择需要改写的HTML及选择一个对象，对象中的部分property会被当作回调函数调用。例如上述例子中`["a" , {....}]` 用于声明一个重写器，实际表示一个元素为2的数组。第一个字符串“a”表示元素选择器，在上述例子中表示找出文档中的所有a标签。第二个对象表示回调对象，对使用元素选择器而言，该对象可以包含以下三个函数：
            
            -   `element`函数，签名为function(e)，当元素选择器选择的element被解析时调用该函数。
                
            -   `comments`函数，签名为function(e)，当element中嵌套的注释被解析时调用该函数。
                
            -   `text`函数，签名为function(e)，当element中的文字被解析时调用该函数。该函数支持调用多次，因为流式处理的原因，HTMLStream可能只是正在处理一个字符串片段。
                
    -   HTMLStream是一个流，您可以直接回复这个流，但HTMLStream内部不会进行数据缓冲，且HTMLStream和常见的parse5、htmlparser2不同，HTMLStream不会生成DOM树，大大减少了处理时间和内存消耗，确保进行HTML解析的同时，保持高吞吐和并发。
        
    

## 重写器

重写器是用于注册重写指示的对象，实际为包含两个元素的数组。对数组的具体说明如下：

-   数组的第一个元素必须为String或null。
    
    -   String：表示一个元素选择器，该选择器始终用于定位一个元素或标签。
        
    -   null：表示整个重写器是针对整个文档的。
        
        **说明**
        
        多数情况下您不需要用文档级别的重写器，文档级别的重写器无法定位元素。
        
-   数组的第二个元素是一个JS对象，表示您注册的回调函数对象。
    
    当您使用元素选择器时，其注册对象称为“元素选择器回调”；当您使用文档选择器时，其注册对象称为“文档选择器回调”。
    

**说明**

同一个HTMLStream可以设置多个不同的重写器，但只能设置一个文档选择器以及支持设置多个元素选择器。

## 元素选择器语法

元素选择器是CSS选择器的语法子集，语法是子集不代表语言和CSS选择器一模一样。元素选择器的语法如下：

-   `*`：所有元素或标签。
    
-   `div`：名为`div`的标签。您可以以此类推其他的标签名称，可以是HTML标签或定制化标签。
    
-   `E#id`：名为E的标签，标签的属性ID是值`id`。
    
-   `E.Class`：名为E的标签，标签的属性Class是值`Class`。
    
-   `E[attr]`：名为E的标签，标签的属性中含有名称attr。
    
-   元素属性选择：
    
    -   `E[attr="a"]`：选择标签E，标签的属性含有名attr，且值为a，注意区分大小写。
        
    -   `E[attr^="a"]`：选择标签E，标签的属性含有名attr，且值为a，不区分大小写。
        
    -   `E[attr$="a"]`：选择标签E，标签的属性含有名attr，且值以“a”结尾。
        
    -   `E[attr^="a"]`：选择标签E，标签的属性含有名attr，且值以“a”开头。
        
    -   `E[attr*="a"]`：选择标签E，标签的属性含有名attr，且值含有“a”。
        
    -   `E[attr|="a"]`：选择标签E，标签的属性含有名attr，且值以“a-”开头的一串英文逗号（,）分隔的列表，例如en-ch, en-us。
        
    
-   序列选择：
    
    -   `E F`：选择标签F，且F存在父节点元素E中。
        
    -   `E > F`：选择标签F，且F的直接父节点元素为E。
        
    
-   `E:not(S)`：选择元素E，S是另外一个选择器，当选择器值为false时，才能选中元素E。
    

## 元素选择器回调

元素选择器回调包含以下三个回调函数。

| **回调函数** | **说明** | **回调函数签名** |
| --- | --- | --- |
| element | 该属性必须为一个非异步函数，该属性会在元素被解析完毕时调用。 | 回调函数的签名为function(e)，传入对象为Element对象。更多信息，请参见[Element](#section-g08-3c0-qh5)。 |
| comments | 该属性必须为一个非异步函数，该属性会在元素选择器选中的元素中存在注释时被调用。 | 回调函数的签名为function(e)，传入对象为Comments对象。更多信息，请参见[Comments](#section-1vc-ehw-2si)。 |
| text | 该属性必须为一个非异步函数，该属性会在元素选择器的元素text部分被解析时被调用。 | 回调函数的签名为function(e)，传入对象为TextChunk对象。更多信息，请参见[TextChunk](#section-n6m-aon-mj2)。 **说明** 该函数会被调用多次，当HTMLStream每次都从HTML原始数据流中读一部分出来text时，每次解析完毕就会调用这个函数。如果您想看到整个text，需要自己缓冲text后拼接起来。 |

**说明**

元素选择器可以不包含以上三个函数，此时对应的元素会被直接输出。如果您只想修改某一部分内容，只需要注册对应的回调函数。

## 文档选择器

文档选择器主要用于选择文档级别的内容。文档选择器用null表示，同一个HTMLStream中只能设置一个文档选择器。

## 文档选择器回调

文档选择器回调函数和元素选择器回调函数类似，文档选择器回调包含以下四个回调函数。

| **回调函数** | **说明** | **回调函数签名** |
| --- | --- | --- |
| doctype | 该属性必须为一个非异步函数，该属性会在文档的doctype被解析后被调用。 | 回调函数的签名为function(e)，传入对象为Doctype对象。更多信息，请参见[Doctype](#section-b91-1ij-445)。 |
| comments | 该属性必须为一个非异步函数，该属性会在文档级别的comments被调用。 | 回调函数的签名为function(e)，传入对象为Comments对象。更多信息，请参见[Comments](#section-1vc-ehw-2si)。 |
| text | 该属性必须为一个非异步函数，该属性会在文档级别非元素的text节点遇到时被调用。 | 回调函数的签名为function(e)，传入对象为TextChunk对象。更多信息，请参见[TextChunk](#section-n6m-aon-mj2)。 **说明** 该函数会被调用多次，当HTMLStream每次都从HTML原始数据流中读一部分出来text时，每次解析完毕就会调用这个函数。如果您想看到整个text，需要自己缓冲text后拼接起来。 |
| docend | 该属性必须为一个非异步函数，该属性会在文档被解析完毕时调用，主要为了追加内容到文档末端，通常可以以注释的形式记录一些debug信息到HTML末尾，用于后续排查和追踪问题。 | 回调函数签名为function(e)，传入对象为Docend对象。更多信息，请参见[Docend](#section-7f1-916-b9e)。 |

## 异常错误处理

以上任何一个回调函数中抛出的JS异常，都会在ER运行时被捕获，同时HTMLStream将停止处理HTML流，并且将您的异常顺势传播到外层。

-   如果HTMLStream的reader.read是在JS中被触发，您的异常会被重新抛出。
    
-   如果HTMLStream的reader.read是在ER运行时被调用，例如返回给客户端，那么异常将被ER运行时吞掉，客户端会看到一个被截断的内容，原因是HTMLStream是一个流，可能一部分已经发送至客户端。该操作与现在的TransformStream的流式读写处理异常方式类似。
    

## 回调参数

每个回调函数都会收到一个对象，表示选择的HTML标签或相关部分，该对象称为回调参数。本文为您介绍Element、TextChunk和Comments等回调参数。

**说明**

-   所有的回调参数必须在回调函数中调用才有效，在回调函数以外的地方调用回调参数对象的属性或方法会导致JS异常。您可以将需要的部分保存到其他JS对象或数据结构中。
    
-   本文中出现的所有option都表示一个对象，对象中的属性html可以被设置为true或false，用于表示该内容是否被解释为HTML内容或纯文字内容。如果将html设置为false，HTMLStream会对其做`html encoding/esacping`。
    

## Element

-   定义
    
    该对象会在Element回调函数被调用时提供给您，表示某个被选择的HTML标签。
    
-   属性
    
    -   `tagName（string）`：标签名字。
        
    -   `attributes（iterator）`：返回一个迭代器，该迭代器返回所有的属性`[name, value]`。
        
    -   `removed（bool)`：只读，表示该元素是否被删除。删除一个元素使用remove，多数情况下需要根据这个标签跳过该元素，因为元素已经被删除。
        
    -   `namespaceURI`：只读，表示该元素的命名空间URI，例如svg或script元素。
        
-   方法
    
    -   修改属性
        
        -   getAttribute(name)：查询某个元素的属性名称。
            
        -   setAttribute(name, value)：设置和修改某个元素的属性名称。
            
        -   hasAttribute(name)：查询某个元素的属性名称是否存在。
            
        -   removeAttribute(name)：删除某个元素的属性名称。
            
        
        **说明**
        
        属性名称和值要求必须是string类型。
        
    -   修改内容
        
        -   before(data, option)：将内容插入到该元素之前，即元素的标签之前。
            
        -   after(data, option)：将内容插入到该元素之后，即元素的标签之后。
            
        -   prepend(data, option)：将内容插入到该元素的内容之前，即元素的开启标签结束的后方，例如`<div>(prepend) |aaaa|（append）</div>`。
            
        -   append(data, option)：将内容插入到该元素的内容之后，即元素的结束标签结束的前方，例如`<div>(prepend) |aaaa|（append）</div>`。
            
        -   replace(data, option)：替换整个元素，包括标签和嵌套的标签都会被替换。
            
        -   setInnerContent(data, option)：设置元素内容，标签和属性不变。
            
        -   remove()：删除该元素，removed属性为true。
            
        -   removeAndKeepContent()：删除元素的标签和属性，保留内容。
            

## TextChunk

-   定义
    
    该对象会在text回调函数被调用时提供给您，代表某个被选择的HTML的Text部分。
    
-   属性
    
    -   `removed（bool)`：只读，表示该元素是否被删除。删除一个元素使用remove，多数情况下需要根据这个标签跳过该元素，因为元素已经被删除。
        
    -   `text（string）`：只读，表示该text的内容。该text有可能只是一部分text，如果此字符串为空，代表这是最后一个chunk，您可以趁机把所有的text拼接起来。
        
    -   `lastInTextNode（bool）`：只读，表示是否为最后一个text。如果为true，text属性返回空字符串。
        
-   方法
    
    修改内容的方法如下：
    
    -   before(data, option)：将内容插入到该元素之前，即元素的标签之前。
        
    -   after(data, option)：将内容插入到该元素之后，即元素的标签之后。
        
    -   replace(data, option)：替换整个元素，包括标签和嵌套的标签都会被替换。
        
    -   remove()：删除该元素，removed属性为true。
        
    

## Comments

-   定义
    
    该对象会在comments回调函数被调用时提供给您，代表某个被选择的HTML的注释部分。
    
-   属性
    
    -   `removed（bool)`：只读，表示该元素是否被删除。删除一个元素使用remove，多数情况下需要根据这个标签跳过该元素，因为元素已经被删除。
        
    -   `text（string）`：可读可写，表示注释的内容或改变注释内容。
        
-   方法
    
    修改内容的方法如下：
    
    -   before(data, option)：将内容插入到该元素之前，即元素的标签之前。
        
    -   after(data, option)：将内容插入到该元素之后，即元素的标签之后。
        
    -   replace(data, option)：替换整个元素，包括标签和嵌套的标签都会被替换。
        
    -   remove()：删除该元素，removed属性为true。
        
    

## Doctype

-   定义
    
    该对象会在doctype回调函数被调用时提供给您，代表某个被选择的HTML的Doctype部分。
    
-   属性
    
    -   `name（string）`：只读，表示doctype名字。
        
    -   `publicId（string）`：只读，如果有表示public identifier，否则返回null。
        
    -   `systemId（string）`：只读，如果有表示system identifier，否则返回null。
        

## Docend

-   定义
    
    该对象会在docend回调函数被调用时提供给您，代表整个HTML的末尾部分。
    
-   方法
    
    append(string, option) ：用于向HTML流末尾加入若干内容。