import styles from "./Streamer.module.css";
// import firebase from "firebase/firebase";
import firebase from "firebase/app";
import "firebase/firestore"
import React, { useRef } from "react";

const Streamer = (props) => {
  const webcamButtonRef = useRef();
  const webcamVideoRef = useRef();
  const callButtonRef = useRef();
  const callInputRef = useRef();
  const answerButtonRef = useRef();
  const remoteVideoRef = useRef();
  const hangupButtonRef = useRef();

  const firestore = firebase.firestore();

  const servers = {
    iceServers: [
      {
        urls: [
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
        ],
      },
    ],
    iceCandidatePoolSize: 10,
  };

  // Global State
  const pc = new RTCPeerConnection(servers);
  let localStream = null;
  let remoteStream = null;

  const webCamHandler = async () => {
    console.log(webcamVideoRef);
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    remoteStream = new MediaStream();

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Pull tracks from remote stream, add to video stream
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };

    webcamVideoRef.current.srcObject = localStream;
    remoteVideoRef.current.srcObject = remoteStream;

    callButtonRef.current.disabled = false;
    answerButtonRef.current.disabled = false;
    webcamButtonRef.current.disabled = true;
  };

  const callHandler = async () => {
    // Reference Firestore collections for signaling
    const callDoc = firestore.collection("calls").doc();
    const offerCandidates = callDoc.collection("offerCandidates");
    const answerCandidates = callDoc.collection("answerCandidates");
    console.log("Here 1")

    callInputRef.current.value = callDoc.id;
    

    // Get candidates for caller, save to db
    pc.onicecandidate = (event) => {
      event.candidate && offerCandidates.add(event.candidate.toJSON());
      console.log("Here 2")
    };

    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };
    console.log("Here 4")

    await callDoc.set({ offer });

    // Listen for remote answer
    callDoc.onSnapshot((snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
        console.log("Here 3")
      }
    });

    // When answered, add candidate to peer connection
    answerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    hangupButtonRef.current.disabled = false;
  };

  const answerHandler = async () => {
    const callId = callInputRef.current.value;
    const callDoc = firestore.collection("calls").doc(callId);
    const answerCandidates = callDoc.collection("answerCandidates");
    const offerCandidates = callDoc.collection("offerCandidates");

    pc.onicecandidate = (event) => {
      event.candidate && answerCandidates.add(event.candidate.toJSON());
    };

    const callData = (await callDoc.get()).data();

    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await callDoc.update({ answer });

    offerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        console.log(change);
        if (change.type === "added") {
          let data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  };

  const hangupHandler = (event) => {};

  return (
    <div>
      <h2>1. Start your Webcam</h2>
      <div className={styles.videos}>
        <span>
          <h3>Local Stream</h3>
          <video
            className={styles.webcamVideo}
            ref={webcamVideoRef}
            autoPlay
            playsInline
          ></video>
        </span>
        <span>
          <h3>Remote Stream</h3>
          <video
            className={styles.webcamVideo}
            ref={remoteVideoRef}
            autoPlay
            playsInline
          ></video>
        </span>
      </div>

      <button onClick={webCamHandler} ref={webcamButtonRef}>
        Start webcam
      </button>
      <h2>2. Create a new Call</h2>
      <button onClick={callHandler} ref={callButtonRef}>
        Create Call (offer)
      </button>

      <h2>3. Join a Call</h2>
      <p>Answer the call from a different browser window or device</p>

      <input ref={callInputRef} />
      <button onClick={answerHandler} ref={answerButtonRef}>
        Answer
      </button>

      <h2>4. Hangup</h2>

      <button onClick={hangupHandler} ref={hangupButtonRef}>
        Hangup
      </button>
    </div>
  );
};

export default Streamer;
