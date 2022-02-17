import React, { useState, useEffect } from "react"
import "../index.css"


export default function Comments({ slug }) { 
  const [commentsData, setCommentsData] = useState([]);
  // commentsData = await getCommentsData();
  useEffect(() => {
    // get data 
    let url = "http://localhost:3002/comments";
    fetch(url)
      .then(response => response.json()) // parse JSON from request
      .then(resultData => {
        setCommentsData(resultData)
      })
  }, [])
  
  
  return (
    <div>
      {commentsData.map((comment, index) => {
        if (index % 2 == 0) {
          return (
            <div class="comment1">
              <p><b>Name:</b> {comment.name}</p>
              <p>
                <b>Comment:</b> {comment.text} <br/>
                <b>Slug:</b> {comment.slug} <br/>
              </p>
            </div>
          )
        } else {
          return (
            <div class="comment2">
              <p><b>Name:</b> {comment.name}</p>
              <p>
                <b>Comment:</b> {comment.text} <br/>
                <b>Slug:</b> {comment.slug} <br/>
              </p>
            </div>
          )
        }
      })}
    </div>
  );
}



