// @generated
/// Generated client implementations.
pub mod access_pattern_service_client {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    use tonic::codegen::http::Uri;
    #[derive(Debug, Clone)]
    pub struct AccessPatternServiceClient<T> {
        inner: tonic::client::Grpc<T>,
    }
    impl AccessPatternServiceClient<tonic::transport::Channel> {
        /// Attempt to create a new client by connecting to a given endpoint.
        pub async fn connect<D>(dst: D) -> Result<Self, tonic::transport::Error>
        where
            D: TryInto<tonic::transport::Endpoint>,
            D::Error: Into<StdError>,
        {
            let conn = tonic::transport::Endpoint::new(dst)?.connect().await?;
            Ok(Self::new(conn))
        }
    }
    impl<T> AccessPatternServiceClient<T>
    where
        T: tonic::client::GrpcService<tonic::body::Body>,
        T::Error: Into<StdError>,
        T::ResponseBody: Body<Data = Bytes> + std::marker::Send + 'static,
        <T::ResponseBody as Body>::Error: Into<StdError> + std::marker::Send,
    {
        pub fn new(inner: T) -> Self {
            let inner = tonic::client::Grpc::new(inner);
            Self { inner }
        }
        pub fn with_origin(inner: T, origin: Uri) -> Self {
            let inner = tonic::client::Grpc::with_origin(inner, origin);
            Self { inner }
        }
        pub fn with_interceptor<F>(
            inner: T,
            interceptor: F,
        ) -> AccessPatternServiceClient<InterceptedService<T, F>>
        where
            F: tonic::service::Interceptor,
            T::ResponseBody: Default,
            T: tonic::codegen::Service<
                http::Request<tonic::body::Body>,
                Response = http::Response<
                    <T as tonic::client::GrpcService<tonic::body::Body>>::ResponseBody,
                >,
            >,
            <T as tonic::codegen::Service<
                http::Request<tonic::body::Body>,
            >>::Error: Into<StdError> + std::marker::Send + std::marker::Sync,
        {
            AccessPatternServiceClient::new(InterceptedService::new(inner, interceptor))
        }
        /// Compress requests with the given encoding.
        ///
        /// This requires the server to support it otherwise it might respond with an
        /// error.
        #[must_use]
        pub fn send_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.inner = self.inner.send_compressed(encoding);
            self
        }
        /// Enable decompressing responses.
        #[must_use]
        pub fn accept_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.inner = self.inner.accept_compressed(encoding);
            self
        }
        /// Limits the maximum size of a decoded message.
        ///
        /// Default: `4MB`
        #[must_use]
        pub fn max_decoding_message_size(mut self, limit: usize) -> Self {
            self.inner = self.inner.max_decoding_message_size(limit);
            self
        }
        /// Limits the maximum size of an encoded message.
        ///
        /// Default: `usize::MAX`
        #[must_use]
        pub fn max_encoding_message_size(mut self, limit: usize) -> Self {
            self.inner = self.inner.max_encoding_message_size(limit);
            self
        }
        pub async fn register_access_pattern(
            &mut self,
            request: impl tonic::IntoRequest<super::RegisterAccessPatternRequest>,
        ) -> std::result::Result<tonic::Response<super::AccessPattern>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.AccessPatternService/RegisterAccessPattern",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.AccessPatternService",
                        "RegisterAccessPattern",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn list_access_patterns(
            &mut self,
            request: impl tonic::IntoRequest<super::ListAccessPatternsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::ListAccessPatternsResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.AccessPatternService/ListAccessPatterns",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.AccessPatternService",
                        "ListAccessPatterns",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn run_access_pattern(
            &mut self,
            request: impl tonic::IntoRequest<super::RunAccessPatternRequest>,
        ) -> std::result::Result<
            tonic::Response<super::RunAccessPatternResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.AccessPatternService/RunAccessPattern",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.AccessPatternService",
                        "RunAccessPattern",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
    }
}
/// Generated server implementations.
pub mod access_pattern_service_server {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    /// Generated trait containing gRPC methods that should be implemented for use with AccessPatternServiceServer.
    #[async_trait]
    pub trait AccessPatternService: std::marker::Send + std::marker::Sync + 'static {
        async fn register_access_pattern(
            &self,
            request: tonic::Request<super::RegisterAccessPatternRequest>,
        ) -> std::result::Result<tonic::Response<super::AccessPattern>, tonic::Status>;
        async fn list_access_patterns(
            &self,
            request: tonic::Request<super::ListAccessPatternsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::ListAccessPatternsResponse>,
            tonic::Status,
        >;
        async fn run_access_pattern(
            &self,
            request: tonic::Request<super::RunAccessPatternRequest>,
        ) -> std::result::Result<
            tonic::Response<super::RunAccessPatternResponse>,
            tonic::Status,
        >;
    }
    #[derive(Debug)]
    pub struct AccessPatternServiceServer<T> {
        inner: Arc<T>,
        accept_compression_encodings: EnabledCompressionEncodings,
        send_compression_encodings: EnabledCompressionEncodings,
        max_decoding_message_size: Option<usize>,
        max_encoding_message_size: Option<usize>,
    }
    impl<T> AccessPatternServiceServer<T> {
        pub fn new(inner: T) -> Self {
            Self::from_arc(Arc::new(inner))
        }
        pub fn from_arc(inner: Arc<T>) -> Self {
            Self {
                inner,
                accept_compression_encodings: Default::default(),
                send_compression_encodings: Default::default(),
                max_decoding_message_size: None,
                max_encoding_message_size: None,
            }
        }
        pub fn with_interceptor<F>(
            inner: T,
            interceptor: F,
        ) -> InterceptedService<Self, F>
        where
            F: tonic::service::Interceptor,
        {
            InterceptedService::new(Self::new(inner), interceptor)
        }
        /// Enable decompressing requests with the given encoding.
        #[must_use]
        pub fn accept_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.accept_compression_encodings.enable(encoding);
            self
        }
        /// Compress responses with the given encoding, if the client supports it.
        #[must_use]
        pub fn send_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.send_compression_encodings.enable(encoding);
            self
        }
        /// Limits the maximum size of a decoded message.
        ///
        /// Default: `4MB`
        #[must_use]
        pub fn max_decoding_message_size(mut self, limit: usize) -> Self {
            self.max_decoding_message_size = Some(limit);
            self
        }
        /// Limits the maximum size of an encoded message.
        ///
        /// Default: `usize::MAX`
        #[must_use]
        pub fn max_encoding_message_size(mut self, limit: usize) -> Self {
            self.max_encoding_message_size = Some(limit);
            self
        }
    }
    impl<T, B> tonic::codegen::Service<http::Request<B>>
    for AccessPatternServiceServer<T>
    where
        T: AccessPatternService,
        B: Body + std::marker::Send + 'static,
        B::Error: Into<StdError> + std::marker::Send + 'static,
    {
        type Response = http::Response<tonic::body::Body>;
        type Error = std::convert::Infallible;
        type Future = BoxFuture<Self::Response, Self::Error>;
        fn poll_ready(
            &mut self,
            _cx: &mut Context<'_>,
        ) -> Poll<std::result::Result<(), Self::Error>> {
            Poll::Ready(Ok(()))
        }
        fn call(&mut self, req: http::Request<B>) -> Self::Future {
            match req.uri().path() {
                "/open_foundry.media_set.AccessPatternService/RegisterAccessPattern" => {
                    #[allow(non_camel_case_types)]
                    struct RegisterAccessPatternSvc<T: AccessPatternService>(pub Arc<T>);
                    impl<
                        T: AccessPatternService,
                    > tonic::server::UnaryService<super::RegisterAccessPatternRequest>
                    for RegisterAccessPatternSvc<T> {
                        type Response = super::AccessPattern;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::RegisterAccessPatternRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AccessPatternService>::register_access_pattern(
                                        &inner,
                                        request,
                                    )
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = RegisterAccessPatternSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.AccessPatternService/ListAccessPatterns" => {
                    #[allow(non_camel_case_types)]
                    struct ListAccessPatternsSvc<T: AccessPatternService>(pub Arc<T>);
                    impl<
                        T: AccessPatternService,
                    > tonic::server::UnaryService<super::ListAccessPatternsRequest>
                    for ListAccessPatternsSvc<T> {
                        type Response = super::ListAccessPatternsResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::ListAccessPatternsRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AccessPatternService>::list_access_patterns(
                                        &inner,
                                        request,
                                    )
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = ListAccessPatternsSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.AccessPatternService/RunAccessPattern" => {
                    #[allow(non_camel_case_types)]
                    struct RunAccessPatternSvc<T: AccessPatternService>(pub Arc<T>);
                    impl<
                        T: AccessPatternService,
                    > tonic::server::UnaryService<super::RunAccessPatternRequest>
                    for RunAccessPatternSvc<T> {
                        type Response = super::RunAccessPatternResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::RunAccessPatternRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AccessPatternService>::run_access_pattern(
                                        &inner,
                                        request,
                                    )
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = RunAccessPatternSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                _ => {
                    Box::pin(async move {
                        let mut response = http::Response::new(
                            tonic::body::Body::default(),
                        );
                        let headers = response.headers_mut();
                        headers
                            .insert(
                                tonic::Status::GRPC_STATUS,
                                (tonic::Code::Unimplemented as i32).into(),
                            );
                        headers
                            .insert(
                                http::header::CONTENT_TYPE,
                                tonic::metadata::GRPC_CONTENT_TYPE,
                            );
                        Ok(response)
                    })
                }
            }
        }
    }
    impl<T> Clone for AccessPatternServiceServer<T> {
        fn clone(&self) -> Self {
            let inner = self.inner.clone();
            Self {
                inner,
                accept_compression_encodings: self.accept_compression_encodings,
                send_compression_encodings: self.send_compression_encodings,
                max_decoding_message_size: self.max_decoding_message_size,
                max_encoding_message_size: self.max_encoding_message_size,
            }
        }
    }
    /// Generated gRPC service name
    pub const SERVICE_NAME: &str = "open_foundry.media_set.AccessPatternService";
    impl<T> tonic::server::NamedService for AccessPatternServiceServer<T> {
        const NAME: &'static str = SERVICE_NAME;
    }
}
/// Generated client implementations.
pub mod media_set_service_client {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    use tonic::codegen::http::Uri;
    #[derive(Debug, Clone)]
    pub struct MediaSetServiceClient<T> {
        inner: tonic::client::Grpc<T>,
    }
    impl MediaSetServiceClient<tonic::transport::Channel> {
        /// Attempt to create a new client by connecting to a given endpoint.
        pub async fn connect<D>(dst: D) -> Result<Self, tonic::transport::Error>
        where
            D: TryInto<tonic::transport::Endpoint>,
            D::Error: Into<StdError>,
        {
            let conn = tonic::transport::Endpoint::new(dst)?.connect().await?;
            Ok(Self::new(conn))
        }
    }
    impl<T> MediaSetServiceClient<T>
    where
        T: tonic::client::GrpcService<tonic::body::Body>,
        T::Error: Into<StdError>,
        T::ResponseBody: Body<Data = Bytes> + std::marker::Send + 'static,
        <T::ResponseBody as Body>::Error: Into<StdError> + std::marker::Send,
    {
        pub fn new(inner: T) -> Self {
            let inner = tonic::client::Grpc::new(inner);
            Self { inner }
        }
        pub fn with_origin(inner: T, origin: Uri) -> Self {
            let inner = tonic::client::Grpc::with_origin(inner, origin);
            Self { inner }
        }
        pub fn with_interceptor<F>(
            inner: T,
            interceptor: F,
        ) -> MediaSetServiceClient<InterceptedService<T, F>>
        where
            F: tonic::service::Interceptor,
            T::ResponseBody: Default,
            T: tonic::codegen::Service<
                http::Request<tonic::body::Body>,
                Response = http::Response<
                    <T as tonic::client::GrpcService<tonic::body::Body>>::ResponseBody,
                >,
            >,
            <T as tonic::codegen::Service<
                http::Request<tonic::body::Body>,
            >>::Error: Into<StdError> + std::marker::Send + std::marker::Sync,
        {
            MediaSetServiceClient::new(InterceptedService::new(inner, interceptor))
        }
        /// Compress requests with the given encoding.
        ///
        /// This requires the server to support it otherwise it might respond with an
        /// error.
        #[must_use]
        pub fn send_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.inner = self.inner.send_compressed(encoding);
            self
        }
        /// Enable decompressing responses.
        #[must_use]
        pub fn accept_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.inner = self.inner.accept_compressed(encoding);
            self
        }
        /// Limits the maximum size of a decoded message.
        ///
        /// Default: `4MB`
        #[must_use]
        pub fn max_decoding_message_size(mut self, limit: usize) -> Self {
            self.inner = self.inner.max_decoding_message_size(limit);
            self
        }
        /// Limits the maximum size of an encoded message.
        ///
        /// Default: `usize::MAX`
        #[must_use]
        pub fn max_encoding_message_size(mut self, limit: usize) -> Self {
            self.inner = self.inner.max_encoding_message_size(limit);
            self
        }
        pub async fn create_media_set(
            &mut self,
            request: impl tonic::IntoRequest<super::CreateMediaSetRequest>,
        ) -> std::result::Result<tonic::Response<super::MediaSet>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/CreateMediaSet",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "CreateMediaSet",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn get_media_set(
            &mut self,
            request: impl tonic::IntoRequest<super::GetMediaSetRequest>,
        ) -> std::result::Result<tonic::Response<super::MediaSet>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/GetMediaSet",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "GetMediaSet",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn list_media_sets(
            &mut self,
            request: impl tonic::IntoRequest<super::ListMediaSetsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::ListMediaSetsResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/ListMediaSets",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "ListMediaSets",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn delete_media_set(
            &mut self,
            request: impl tonic::IntoRequest<super::DeleteMediaSetRequest>,
        ) -> std::result::Result<
            tonic::Response<super::DeleteMediaSetResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/DeleteMediaSet",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "DeleteMediaSet",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn open_transaction(
            &mut self,
            request: impl tonic::IntoRequest<super::OpenTransactionRequest>,
        ) -> std::result::Result<tonic::Response<super::Transaction>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/OpenTransaction",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "OpenTransaction",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn commit_transaction(
            &mut self,
            request: impl tonic::IntoRequest<super::CommitTransactionRequest>,
        ) -> std::result::Result<tonic::Response<super::Transaction>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/CommitTransaction",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "CommitTransaction",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn abort_transaction(
            &mut self,
            request: impl tonic::IntoRequest<super::AbortTransactionRequest>,
        ) -> std::result::Result<tonic::Response<super::Transaction>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/AbortTransaction",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "AbortTransaction",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn list_media_items(
            &mut self,
            request: impl tonic::IntoRequest<super::ListMediaItemsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::ListMediaItemsResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/ListMediaItems",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "ListMediaItems",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn get_media_item(
            &mut self,
            request: impl tonic::IntoRequest<super::GetMediaItemRequest>,
        ) -> std::result::Result<tonic::Response<super::MediaItem>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/GetMediaItem",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "GetMediaItem",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn delete_media_item(
            &mut self,
            request: impl tonic::IntoRequest<super::DeleteMediaItemRequest>,
        ) -> std::result::Result<
            tonic::Response<super::DeleteMediaItemResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/DeleteMediaItem",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "DeleteMediaItem",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn generate_presigned_upload_url(
            &mut self,
            request: impl tonic::IntoRequest<super::GeneratePresignedUploadUrlRequest>,
        ) -> std::result::Result<
            tonic::Response<super::PresignedUrlResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/GeneratePresignedUploadUrl",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "GeneratePresignedUploadUrl",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn generate_presigned_download_url(
            &mut self,
            request: impl tonic::IntoRequest<super::GeneratePresignedDownloadUrlRequest>,
        ) -> std::result::Result<
            tonic::Response<super::PresignedUrlResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/GeneratePresignedDownloadUrl",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "GeneratePresignedDownloadUrl",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn register_virtual_media_item(
            &mut self,
            request: impl tonic::IntoRequest<super::RegisterVirtualMediaItemRequest>,
        ) -> std::result::Result<tonic::Response<super::MediaItem>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/open_foundry.media_set.MediaSetService/RegisterVirtualMediaItem",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "open_foundry.media_set.MediaSetService",
                        "RegisterVirtualMediaItem",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
    }
}
/// Generated server implementations.
pub mod media_set_service_server {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    /// Generated trait containing gRPC methods that should be implemented for use with MediaSetServiceServer.
    #[async_trait]
    pub trait MediaSetService: std::marker::Send + std::marker::Sync + 'static {
        async fn create_media_set(
            &self,
            request: tonic::Request<super::CreateMediaSetRequest>,
        ) -> std::result::Result<tonic::Response<super::MediaSet>, tonic::Status>;
        async fn get_media_set(
            &self,
            request: tonic::Request<super::GetMediaSetRequest>,
        ) -> std::result::Result<tonic::Response<super::MediaSet>, tonic::Status>;
        async fn list_media_sets(
            &self,
            request: tonic::Request<super::ListMediaSetsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::ListMediaSetsResponse>,
            tonic::Status,
        >;
        async fn delete_media_set(
            &self,
            request: tonic::Request<super::DeleteMediaSetRequest>,
        ) -> std::result::Result<
            tonic::Response<super::DeleteMediaSetResponse>,
            tonic::Status,
        >;
        async fn open_transaction(
            &self,
            request: tonic::Request<super::OpenTransactionRequest>,
        ) -> std::result::Result<tonic::Response<super::Transaction>, tonic::Status>;
        async fn commit_transaction(
            &self,
            request: tonic::Request<super::CommitTransactionRequest>,
        ) -> std::result::Result<tonic::Response<super::Transaction>, tonic::Status>;
        async fn abort_transaction(
            &self,
            request: tonic::Request<super::AbortTransactionRequest>,
        ) -> std::result::Result<tonic::Response<super::Transaction>, tonic::Status>;
        async fn list_media_items(
            &self,
            request: tonic::Request<super::ListMediaItemsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::ListMediaItemsResponse>,
            tonic::Status,
        >;
        async fn get_media_item(
            &self,
            request: tonic::Request<super::GetMediaItemRequest>,
        ) -> std::result::Result<tonic::Response<super::MediaItem>, tonic::Status>;
        async fn delete_media_item(
            &self,
            request: tonic::Request<super::DeleteMediaItemRequest>,
        ) -> std::result::Result<
            tonic::Response<super::DeleteMediaItemResponse>,
            tonic::Status,
        >;
        async fn generate_presigned_upload_url(
            &self,
            request: tonic::Request<super::GeneratePresignedUploadUrlRequest>,
        ) -> std::result::Result<
            tonic::Response<super::PresignedUrlResponse>,
            tonic::Status,
        >;
        async fn generate_presigned_download_url(
            &self,
            request: tonic::Request<super::GeneratePresignedDownloadUrlRequest>,
        ) -> std::result::Result<
            tonic::Response<super::PresignedUrlResponse>,
            tonic::Status,
        >;
        async fn register_virtual_media_item(
            &self,
            request: tonic::Request<super::RegisterVirtualMediaItemRequest>,
        ) -> std::result::Result<tonic::Response<super::MediaItem>, tonic::Status>;
    }
    #[derive(Debug)]
    pub struct MediaSetServiceServer<T> {
        inner: Arc<T>,
        accept_compression_encodings: EnabledCompressionEncodings,
        send_compression_encodings: EnabledCompressionEncodings,
        max_decoding_message_size: Option<usize>,
        max_encoding_message_size: Option<usize>,
    }
    impl<T> MediaSetServiceServer<T> {
        pub fn new(inner: T) -> Self {
            Self::from_arc(Arc::new(inner))
        }
        pub fn from_arc(inner: Arc<T>) -> Self {
            Self {
                inner,
                accept_compression_encodings: Default::default(),
                send_compression_encodings: Default::default(),
                max_decoding_message_size: None,
                max_encoding_message_size: None,
            }
        }
        pub fn with_interceptor<F>(
            inner: T,
            interceptor: F,
        ) -> InterceptedService<Self, F>
        where
            F: tonic::service::Interceptor,
        {
            InterceptedService::new(Self::new(inner), interceptor)
        }
        /// Enable decompressing requests with the given encoding.
        #[must_use]
        pub fn accept_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.accept_compression_encodings.enable(encoding);
            self
        }
        /// Compress responses with the given encoding, if the client supports it.
        #[must_use]
        pub fn send_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.send_compression_encodings.enable(encoding);
            self
        }
        /// Limits the maximum size of a decoded message.
        ///
        /// Default: `4MB`
        #[must_use]
        pub fn max_decoding_message_size(mut self, limit: usize) -> Self {
            self.max_decoding_message_size = Some(limit);
            self
        }
        /// Limits the maximum size of an encoded message.
        ///
        /// Default: `usize::MAX`
        #[must_use]
        pub fn max_encoding_message_size(mut self, limit: usize) -> Self {
            self.max_encoding_message_size = Some(limit);
            self
        }
    }
    impl<T, B> tonic::codegen::Service<http::Request<B>> for MediaSetServiceServer<T>
    where
        T: MediaSetService,
        B: Body + std::marker::Send + 'static,
        B::Error: Into<StdError> + std::marker::Send + 'static,
    {
        type Response = http::Response<tonic::body::Body>;
        type Error = std::convert::Infallible;
        type Future = BoxFuture<Self::Response, Self::Error>;
        fn poll_ready(
            &mut self,
            _cx: &mut Context<'_>,
        ) -> Poll<std::result::Result<(), Self::Error>> {
            Poll::Ready(Ok(()))
        }
        fn call(&mut self, req: http::Request<B>) -> Self::Future {
            match req.uri().path() {
                "/open_foundry.media_set.MediaSetService/CreateMediaSet" => {
                    #[allow(non_camel_case_types)]
                    struct CreateMediaSetSvc<T: MediaSetService>(pub Arc<T>);
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<super::CreateMediaSetRequest>
                    for CreateMediaSetSvc<T> {
                        type Response = super::MediaSet;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::CreateMediaSetRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::create_media_set(&inner, request)
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = CreateMediaSetSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.MediaSetService/GetMediaSet" => {
                    #[allow(non_camel_case_types)]
                    struct GetMediaSetSvc<T: MediaSetService>(pub Arc<T>);
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<super::GetMediaSetRequest>
                    for GetMediaSetSvc<T> {
                        type Response = super::MediaSet;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetMediaSetRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::get_media_set(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = GetMediaSetSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.MediaSetService/ListMediaSets" => {
                    #[allow(non_camel_case_types)]
                    struct ListMediaSetsSvc<T: MediaSetService>(pub Arc<T>);
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<super::ListMediaSetsRequest>
                    for ListMediaSetsSvc<T> {
                        type Response = super::ListMediaSetsResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::ListMediaSetsRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::list_media_sets(&inner, request)
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = ListMediaSetsSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.MediaSetService/DeleteMediaSet" => {
                    #[allow(non_camel_case_types)]
                    struct DeleteMediaSetSvc<T: MediaSetService>(pub Arc<T>);
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<super::DeleteMediaSetRequest>
                    for DeleteMediaSetSvc<T> {
                        type Response = super::DeleteMediaSetResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::DeleteMediaSetRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::delete_media_set(&inner, request)
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = DeleteMediaSetSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.MediaSetService/OpenTransaction" => {
                    #[allow(non_camel_case_types)]
                    struct OpenTransactionSvc<T: MediaSetService>(pub Arc<T>);
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<super::OpenTransactionRequest>
                    for OpenTransactionSvc<T> {
                        type Response = super::Transaction;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::OpenTransactionRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::open_transaction(&inner, request)
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = OpenTransactionSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.MediaSetService/CommitTransaction" => {
                    #[allow(non_camel_case_types)]
                    struct CommitTransactionSvc<T: MediaSetService>(pub Arc<T>);
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<super::CommitTransactionRequest>
                    for CommitTransactionSvc<T> {
                        type Response = super::Transaction;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::CommitTransactionRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::commit_transaction(&inner, request)
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = CommitTransactionSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.MediaSetService/AbortTransaction" => {
                    #[allow(non_camel_case_types)]
                    struct AbortTransactionSvc<T: MediaSetService>(pub Arc<T>);
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<super::AbortTransactionRequest>
                    for AbortTransactionSvc<T> {
                        type Response = super::Transaction;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::AbortTransactionRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::abort_transaction(&inner, request)
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = AbortTransactionSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.MediaSetService/ListMediaItems" => {
                    #[allow(non_camel_case_types)]
                    struct ListMediaItemsSvc<T: MediaSetService>(pub Arc<T>);
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<super::ListMediaItemsRequest>
                    for ListMediaItemsSvc<T> {
                        type Response = super::ListMediaItemsResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::ListMediaItemsRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::list_media_items(&inner, request)
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = ListMediaItemsSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.MediaSetService/GetMediaItem" => {
                    #[allow(non_camel_case_types)]
                    struct GetMediaItemSvc<T: MediaSetService>(pub Arc<T>);
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<super::GetMediaItemRequest>
                    for GetMediaItemSvc<T> {
                        type Response = super::MediaItem;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetMediaItemRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::get_media_item(&inner, request)
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = GetMediaItemSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.MediaSetService/DeleteMediaItem" => {
                    #[allow(non_camel_case_types)]
                    struct DeleteMediaItemSvc<T: MediaSetService>(pub Arc<T>);
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<super::DeleteMediaItemRequest>
                    for DeleteMediaItemSvc<T> {
                        type Response = super::DeleteMediaItemResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::DeleteMediaItemRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::delete_media_item(&inner, request)
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = DeleteMediaItemSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.MediaSetService/GeneratePresignedUploadUrl" => {
                    #[allow(non_camel_case_types)]
                    struct GeneratePresignedUploadUrlSvc<T: MediaSetService>(pub Arc<T>);
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<
                        super::GeneratePresignedUploadUrlRequest,
                    > for GeneratePresignedUploadUrlSvc<T> {
                        type Response = super::PresignedUrlResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<
                                super::GeneratePresignedUploadUrlRequest,
                            >,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::generate_presigned_upload_url(
                                        &inner,
                                        request,
                                    )
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = GeneratePresignedUploadUrlSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.MediaSetService/GeneratePresignedDownloadUrl" => {
                    #[allow(non_camel_case_types)]
                    struct GeneratePresignedDownloadUrlSvc<T: MediaSetService>(
                        pub Arc<T>,
                    );
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<
                        super::GeneratePresignedDownloadUrlRequest,
                    > for GeneratePresignedDownloadUrlSvc<T> {
                        type Response = super::PresignedUrlResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<
                                super::GeneratePresignedDownloadUrlRequest,
                            >,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::generate_presigned_download_url(
                                        &inner,
                                        request,
                                    )
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = GeneratePresignedDownloadUrlSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/open_foundry.media_set.MediaSetService/RegisterVirtualMediaItem" => {
                    #[allow(non_camel_case_types)]
                    struct RegisterVirtualMediaItemSvc<T: MediaSetService>(pub Arc<T>);
                    impl<
                        T: MediaSetService,
                    > tonic::server::UnaryService<super::RegisterVirtualMediaItemRequest>
                    for RegisterVirtualMediaItemSvc<T> {
                        type Response = super::MediaItem;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<
                                super::RegisterVirtualMediaItemRequest,
                            >,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MediaSetService>::register_virtual_media_item(
                                        &inner,
                                        request,
                                    )
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = RegisterVirtualMediaItemSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                _ => {
                    Box::pin(async move {
                        let mut response = http::Response::new(
                            tonic::body::Body::default(),
                        );
                        let headers = response.headers_mut();
                        headers
                            .insert(
                                tonic::Status::GRPC_STATUS,
                                (tonic::Code::Unimplemented as i32).into(),
                            );
                        headers
                            .insert(
                                http::header::CONTENT_TYPE,
                                tonic::metadata::GRPC_CONTENT_TYPE,
                            );
                        Ok(response)
                    })
                }
            }
        }
    }
    impl<T> Clone for MediaSetServiceServer<T> {
        fn clone(&self) -> Self {
            let inner = self.inner.clone();
            Self {
                inner,
                accept_compression_encodings: self.accept_compression_encodings,
                send_compression_encodings: self.send_compression_encodings,
                max_decoding_message_size: self.max_decoding_message_size,
                max_encoding_message_size: self.max_encoding_message_size,
            }
        }
    }
    /// Generated gRPC service name
    pub const SERVICE_NAME: &str = "open_foundry.media_set.MediaSetService";
    impl<T> tonic::server::NamedService for MediaSetServiceServer<T> {
        const NAME: &'static str = SERVICE_NAME;
    }
}
