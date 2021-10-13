import React from "react"
import "../index.css"
import Layout from "../components/layout"

export default function Home() {
    return (
				<Layout>
						<h1>Stephen Fay</h1>
            <pquote style={{ marginTop:'-16px' }}>
                    <b>Eye color:</b> grey,<br/>
                    <b>Language of choice:</b> Python, <br/>
                    <b>Favourite math:</b> stoke's theorem, the isomorphism theorems, <br/> 
                    <b>Favourite ensemble:</b> the canonical ensemble,<br/> 
                    <b>Favourite distrubition:</b> Gibbs, <br/> 
                    <b>Favourite physics (theory):</b> Classical physics, <br/> 
                    <b>Longest breath holding record:</b> 3m + epsilon seconds, <br/> 
                    <b>Unexpected talent:</b> I play the Cello, <br/> 
                    <b>Text editor of choice:</b> vim, vscode with vim keymappings, <br/> 
                    <b>Other hobbies:</b> Jiu-Jitsu, Judo, biking, basking in the sun.<br/>
                    <br/>Currently I'm working on digital signal processing techniques for radio telescopes.  
										<br/><br/>

										<b>Little Fun things I built</b> <br/>
										<a href="https://github.com/dcxSt/mcgill_physics_hackathon2020">Snowflake groth cellular automaton</a>, <br/>
										<a href="https://atom-war.dcxst.repl.co/">Atom Wars</a> - a cookie clicker game built on the Rinkeby Etherium test-net, <br/>
										<a href="https://github.com/dcxSt/lipschitz">H-Trees</a> - my first hackathon, <br/>
										<a href="https://github.com/dcxSt/alien_wiki_chrome_extension">Alien Wikipedia</a> - a chrome extension that makes reading wikipedia more entertaining
										
										<br/><br/>
										<b>Homies</b> <br/>
										<a href="https://marleyx.com" styel={{ unerline:"none" }}>Marley</a>, 
										<a href="https://marcelgoh.ca/">Marcel</a>,
										<a href="https://rosieyzh.github.io/" style={{ underline:"none" }}>Rosie</a>, 
										<br/><br/>
										<b>Self</b> <br/>
										<a href="https://curius.app/stephen-fay">curious profile</a>, 
										<a href="https://projecteuler.net/profile/dcxStephen.png">project euler profile</a>
                </pquote>
								<br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>
						</Layout>
								/* not very elegant solution for whitespace at bottom of page */
    );
}

