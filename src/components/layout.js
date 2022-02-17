import React from "react"
import Sidenav from "./sidebar"
import Flynav from "./flybar"
// 

export default function Layout({ children }) {
    return (
        <div>
            <Sidenav /> 
						<Flynav />
            <div class="main">
                { children } 
            </div>  
						<br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
        </div>
    )
}
