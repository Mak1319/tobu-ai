---
# yaml-language-server: $schema=schemas/note.schema.json
Object type:
    - Note
Creation date: "2026-08-01T17:29:09Z"
Created by:
    - Mainak Manna
id: bafyreibz3nxjiy44jjauocijlbsfluefjm3iq3alck5u36jvsq7xf2wp3m
---

# I want to create a worker

Task: in simple term it just triggers when a Redis stream arrives and convert a document into md file then it call and then genrates a subject wise relation graph

What worker get

1. you will get a redis stream notification with some info

```
1. sessionId
2. uploadKey
3. fileHash
```

The stream source is minio notification on upload  
2. A mongodb database , document

```
search for fileHash as hashId

Collection name: hashContentMap
```

3. MinIO S3 Bucket

```
1. uploaded-documents bucket
2. processed-documents bucket
```

### What the worker have to do:

1. Receives notification from Redis stream . @trigger
2. check collection with file-hash
3. if hash found send a redis stream success message

```
xadd
```

4. if not found then process document
5. collect the document from the @uploadKey
6. Check : if the document has any image or not or the document is itself a image or not
7. if image found then send to docling
8. if not found collect all the text and make it a markdown document ( vector document )
9. when the docling get document it process it into markdown document
10. After ( 7/ 8 ) upload the document back into minio @processed-documents and contents should be proceed to next step
11. An ollama/llama.cpp model ( configured on runtime or through .env file / runtime arg has more priority)
12. Model will collect all the available subject and there subtopics and then extend there sub topics into granular level and then make a relational graph using dict where related topics have edges with some weight with it . weight is decided by how related they are , if they are no related (< 20 ) not to make edge ( weight should be 0 to 100 )
13. if models fails to collect the data ( due to invalid syllabus text or other reason ) proceed to next step
14. If passes store the content as json into @hashContentMap
15. after ( 13/14 ) it will upload the status to redis stream with @xadd

```
redis notification list from minio = "minio-events"
redis result stream to UI = "docling_result"
```
