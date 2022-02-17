import React, { useState, useEffect } from "react"
import "../index.css"


export default function CommentForm () { 
  const [name, setName] = useState("");
  const [comment , setComment] = useState("");
  const [slug , setSlug] = useState("");
  // const [userData, setUserData] = useState(0)
  // get user data from cache?
  // 
  // some js here to handle submit clicks
  function HandleSubmit(evt) {
    evt.preventDefault()
    setSlug("dummy-slug");
    // alert(`Submitting Email ${email}`)
    const url = "http://localhost:3002/comments"; // local
    const reqOptions = {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ 
        name: name,
        text: comment,
        slug: slug
      })
    };
    fetch(url, reqOptions)
      .then((res) => console.log(name));
  }
  
  return (
    <div class="commentform">
      <form onSubmit={HandleSubmit}>
          <input type="name" class="inputemail" placeholder="User Name" value={name} onChange={e => setName(e.target.value)} />
          <br/><br/>
          <textarea class="inputtext" rows="5" cols="39" placeholder="Comment" value={comment} onChange={e => setComment(e.target.value)} />
          <br/>
          <input type="submit" value="Submit" />
      </form>
    </div>
  );
}


